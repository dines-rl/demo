import { Probot, Context } from "probot";
import { Runloop } from "@runloop/api-client";
import { DevboxAsyncExecutionDetailView } from "@runloop/api-client/src/resources/index.js";
import { getSuggestionsFromGPT } from "./GetDiffForFile.js";
import { set } from "zod";

const client = new Runloop({
  bearerToken: process.env.RUNLOOP_KEY || "",
});
client.bearerToken;
console.log(`RLKEY (${client.bearerToken}):`, process.env.RUNLOOP_KEY);

export default (app: Probot) => {
  app.on("pull_request.closed", async (context) => {
    ghPRComment(
      `Thanks for closing this PR! I will now delete the devbox associated with it.`,
      context
    );

    context.payload.pull_request.labels.forEach(async (label: any) => {
      if (label.name.includes("devbox-")) {
        const devboxID = label.name.split("-")[1];
        try {
          await ghPRComment(
            `Your devbox \`${devboxID}\` is being deleted.`,
            context
          );
          await client.devboxes.shutdown(devboxID);
          await context.octokit.issues.removeLabel({
            ...context.issue(),
            labels: [`devbox-${devboxID}`],
          });

          await ghPRComment(
            `Your devbox \`${devboxID}\` has been deleted.`,
            context
          );
          console.log(`Devbox 🤖 with ID: [${devboxID}] deleted`);
        } catch (e) {
          ghPRComment(
            `Your devbox \`${devboxID}\` failed to delete because of the following error: \n\`\`\`${e}\`\`\``,
            context
          );
          console.error("RunloopError:", e);
        }
      }
    });
  });

  app.on("pull_request.opened", (context) => {
    pullRequestOpened(context);
  });

  app.on("pull_request.reopened", (context) => {
    pullRequestOpened(context);
  });

  async function pullRequestOpened(
    context: Context<"pull_request.opened" | "pull_request.reopened">
  ) {
    const statusBanner = await new ghPRBanner(
      "# PR Fixer 🤖",
      "Thanks for opening this issue! I will now create a devbox for you to operate on the code.",
      context
    ).start();

    // Get the diff for the PR

    // Get the changed files under src folder
    const files = await context.octokit.pulls.listFiles({
      ...context.pullRequest(),
    });
    const srcFiles = files.data.filter((file) =>
      file.filename.startsWith("src/")
    );

    // srcFiles.forEach(async (file) => {
    //file.patch
    // })
    statusBanner.setStatusMessage(
      `Found Files to Improve:\n ${srcFiles
        .map((file) => "- `" + file.filename + "`")
        .join(",\n")}`
    );

    try {
      statusBanner.setStatusMessage(`Starting Devbox 💻`);
      let devbox = await client.devboxes.create({
        name: `PR-${context.payload.pull_request.number}`,
        launch_parameters: {
          keep_alive_time_seconds: 100 * 60,
        },
        environment_variables: {
          GITHUB_PR_NUMBER: context.payload.pull_request.number.toString(),
          GITHUB_PR_URL: context.payload.pull_request.html_url,
        },
        metadata: {
          github_pr_number: context.payload.pull_request.number.toString(),
          github_pr_url: context.payload.pull_request.html_url,
          github_pr_title: context.payload.pull_request.title,
          github_pr_owner: context.payload.repository.owner.login,
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
        },
        setup_commands: [
          `echo 'Hello, World ${context.payload.pull_request.number}'`,
        ],
      });
      statusBanner.setStatusMessage(
        `Associating Devbox with PR label ${`devbox-${devbox.id}`}`
      );
      // Add a label to the issue
      await context.octokit.issues.addLabels({
        ...context.issue(),
        labels: [`devbox-${devbox.id}`, "runloop"],
      });

      await awaitDevboxReady(statusBanner, devbox.id!, 10, 1000);

      statusBanner.setTitleMessage(
        `# PR Fixer 🤖 /w [Devbox ${devbox.id}](https://platform.runloop.ai/devboxes/${devbox.id})`
      );
      statusBanner.setStatusMessage(`Devbox 🤖 created with ID: \`${devbox.id}\` is ready at [view on platform.runloop.ai](https://platform.runloop.ai/devboxes/${devbox.id}). 
        \nWe will now check out your repository and run tests on it.`);
      await client.devboxes.executeSync(devbox.id!, {
        command: `git clone ${context.payload.repository.clone_url}`,
        shell_name: "bash",
      });
      statusBanner.setStatusMessage(
        `Checking out repository \`${context.payload.repository.full_name}\``
      );

      await client.devboxes.executeSync(devbox.id!, {
        command: `cd ${context.payload.repository.name}`,
        shell_name: "bash",
      });

      statusBanner.setStatusMessage(
        `Moving to \`${context.payload.repository.full_name}\` directory`
      );

      let fileNameCommand = await client.devboxes.executeSync(devbox.id!, {
        command: `pwd`,
        shell_name: "bash",
      });
      const currentWorkingDirectory = fileNameCommand.stdout?.trim();

      statusBanner.setStatusMessage(
        `Checking out branch \`${context.payload.pull_request.head.ref}\``
      );
      await client.devboxes.executeSync(devbox.id!, {
        command: `git checkout ${context.payload.pull_request.head.ref}`,
        shell_name: "bash",
      });

      statusBanner.setStatusMessage(`Npm Installing and building the repo`);
      await client.devboxes.executeSync(devbox.id!, {
        command: `npm i && npm run build`,
        shell_name: "bash",
      });

      statusBanner.setStatusMessage(`Running Control \`npm run test\` 🧪`);
      const result = await client.devboxes.executeSync(devbox.id!, {
        command: `npm run test`,
        shell_name: "bash",
      });

      await ghPRComment(
        `\#\#\# Control Test results
        \n\`\`\`${result.stdout}\`\`\``,
        context
      );

      const absolutefilePath =
        currentWorkingDirectory + "/" + srcFiles[0].filename;

      const fileContents = await client.devboxes.readFileContents(devbox.id!, {
        file_path: absolutefilePath,
      });

      const gptResult = await getSuggestionsFromGPT(
        srcFiles[0].filename,
        fileContents,
        { temperature: 0.5 }
      );

      await ghPRComment(
        `GPT Responded with \`${
          gptResult.changes.length
        }\` changes! \n \`\`\`\n${gptResult.changes.map((change) => {
          return `// ${change.shortDescription} - ${change.longDescription}\n${change.newCode}\n`;
        })}\n\`\`\``,
        context
      );

      if (gptResult.changes.length === 0) {
        await ghPRComment(
          `Congradulations! No changes were suggested for the file ${gptResult.filename}`,
          context
        );
      } else {
        // Apply Changes
        await ghPRComment(
          `Applying changes to file ${gptResult.filename} with ${gptResult.changes.length} changes\n \`\`\`${gptResult.changed}\n\`\`\``,
          context
        );
        await client.devboxes.writeFile(devbox.id!, {
          file_path: currentWorkingDirectory + "/" + gptResult.filename,
          contents: gptResult.changed!,
        });

        // Run build
        await ghPRComment(`Running \`npm run build\` 🏗️`, context);
        const buildResult = await client.devboxes.executeSync(devbox.id!, {
          command: `npm run build`,
          shell_name: "bash",
        });

        if (buildResult.exit_status !== 0) {
          await ghPRComment(
            `Failed to build because of the following error: \n\`\`\`${buildResult.stdout}\`\`\``,
            context
          );
          return;
        }

        // Test Changes
        await ghPRComment(`Running \`npm run test\` 🧪`, context);
        const testResult = await client.devboxes.executeSync(devbox.id!, {
          command: `npm run test`,
          shell_name: "bash",
        });
        if (testResult.exit_status === 0) {
          await ghPRComment(
            `Changes applied successfully and tests passed!\n\`\`\`\n${testResult.stdout}\n\`\`\``,
            context
          );
          // Report changes
          gptResult.changes.forEach(async (change) => {
            try {
              await context.octokit.pulls.createReviewComment({
                ...context.pullRequest(),
                path: gptResult.filename,
                commit_id: context.payload.pull_request.head.sha,
                side: "RIGHT",
                line: change.oldCodeLineStart,
                body: `### ${change.shortDescription}\n${change.longDescription} \n\`\`\`suggestion\n${change.newCode}\n\`\`\``,
              });
            } catch (e) {
              await ghPRComment(
                `Failed to apply change because of the following error: \n\`\`\`\n${e}\n\`\`\``,
                context
              );
              console.error("Error Applying Change:", e);
            }
          });
        } else {
          await ghPRComment(
            `Changes failed to apply because of the following error: \n\`\`\`\n${result.stdout}\n\`\`\``,
            context
          );
        }
      }

      await ghPRComment(`Done!`, context);
    } catch (e) {
      await ghPRComment(
        `Your devbox failed to start becasue of the following error: \n\`\`\`\n${e}\n\`\`\``,
        context
      );
      console.error("RunloopError:", e);
      return;
    }
  }
};

async function awaitCommandCompletion(
  { execution_id, devbox_id }: DevboxAsyncExecutionDetailView,
  context: any,
  maxAttempts = 50,
  pollInterval = 1000
) {
  let command;
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      command = await client.devboxes.executions.retrieve(
        devbox_id!,
        execution_id!
      );

      await ghPRComment(
        `Command ${execution_id} status: ${command.status} exit: ${
          command.exit_status
        } attempt: ${attempts + 1}: \n\`\`\`${command.stdout}\`\`\``,
        context
      );
      if (command.status === "completed") {
        return command;
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (e) {
      await ghPRComment(
        `Command (${execution_id}) failed because of the following error: \n\`\`\`${e}\`\`\``,
        context
      );
      console.error("Error During Completion:", e);
      throw e;
    }
  }
  throw new Error(
    `Command ${execution_id} did not complete after ${maxAttempts} attempts`
  );
}

async function awaitDevboxReady(
  statusBanner: ghPRBanner,
  devboxID: string,
  maxAttempts = 100,
  pollInterval = 1000
) {
  let devbox;
  let attempts = 0;
  while (attempts < maxAttempts) {
    devbox = await client.devboxes.retrieve(devboxID);
    console.log(`Devbox ${devboxID} status: ${devbox.status}`);
    if (devbox.status === "running") {
      console.log(`Devbox ${devboxID} is running`);
      return devbox;
    }
    statusBanner.setStatusMessage(
      `Awaiting Devbox status: ${devbox.status} attempt: ${attempts + 1}`
    );
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(
    `Devbox ${devboxID} did not start after ${maxAttempts} attempts`
  );
}

async function ghPRComment(
  body: string,
  context: Context<
    "pull_request.opened" | "pull_request.reopened" | "pull_request.closed"
  >,
  existingPRCommentID?: number
) {
  const actionDetails = context.pullRequest();
  if (existingPRCommentID) {
    return context.octokit.issues.updateComment({
      ...context.issue(),
      owner: actionDetails.owner,
      repo: actionDetails.repo,
      issue_number: actionDetails.pull_number,
      body: body,
      comment_id: existingPRCommentID,
    });
  } else {
    return context.octokit.issues.createComment({
      ...context.issue({
        owner: actionDetails.owner,
        repo: actionDetails.repo,
        issue_number: actionDetails.pull_number,
        body: body,
      }),
    });
  }
}

type ContextType = Context<"pull_request.opened" | "pull_request.reopened">;
class ghPRBanner {
  updateIntervalMs: number = 3000;
  lastMessageId?: number;
  titleMessage: string = "";
  statusMessage: string = "";
  context: ContextType;
  dirty: boolean = true;
  minNumberOfLines: number = 10;
  lastLines: string[] = [];
  dotNum = 0;

  constructor(
    titleMessage: string,
    statusMessage: string,
    context: ContextType
  ) {
    this.context = context;
    this.titleMessage = titleMessage;
    this.statusMessage = statusMessage;
  }

  async start() {
    setTimeout(() => {
      this.checkUpdate();
    }, this.updateIntervalMs);
    return this;
  }

  setTitleMessage(title: string) {
    this.titleMessage = title;
    this.dirty = true;
  }

  setStatusMessage(message: string) {
    if (this.statusMessage) {
      const firstLine = this.statusMessage.split("\n")[0];
      this.lastLines.push("> " + firstLine + "\n");
      if (this.lastLines.length > this.minNumberOfLines) {
        this.lastLines.shift();
      }
    }
    this.statusMessage = message;
    this.dirty = true;
  }

  async checkUpdate() {
    const timeStart = new Date().getTime();
    console.log(`Running ${timeStart}`);
    let timeEnd = timeStart;
    try {
      //if (this.dirty) {
      const lastLinesString = this.lastLines.join("\n");
      this.dirty = false;
      let totalMessage = this.titleMessage + `\n\n`;
      const dotNumString =
        this.dotNum++ % 4 === 0 ? "" : ".".repeat(this.dotNum % 4);

      // Check if total message has min number of lines
      if (this.lastLines.length < this.minNumberOfLines) {
        for (
          let i = 0;
          i < this.minNumberOfLines - this.lastLines.length;
          i++
        ) {
          totalMessage += "\n>‎ ";
        }
      }
      totalMessage +=
        lastLinesString + `\n` + "### " + this.statusMessage + dotNumString;
      totalMessage += "\n[runloop.ai](runloop.ai)";
      const result = await ghPRComment(
        totalMessage,
        this.context,
        this.lastMessageId
      );
      timeEnd = new Date().getTime();
      console.log("Last Message ID:", result.data.id);
      if (this.lastMessageId === undefined) {
        this.lastMessageId = result.data.id;
      }
      //   }
    } catch (e) {
      console.error("Error during checkUpdate:", e);
    }

    setTimeout(
      this.checkUpdate.bind(this),
      this.updateIntervalMs - Math.min(timeEnd - timeStart, 0)
    );
  }
}
