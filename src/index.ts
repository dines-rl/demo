import { Probot, Context } from "probot";
import { Runloop } from "@runloop/api-client";
import { DevboxAsyncExecutionDetailView } from "@runloop/api-client/src/resources/index.js";

const client = new Runloop({
  bearerToken: process.env.RUNLOOP_KEY || "",
});
client.bearerToken;
console.log(`RLKEY (${client.bearerToken}):`, process.env.RUNLOOP_KEY);

export default (app: Probot) => {
  app.on("pull_request.closed", async (context) => {
    context.octokit.pulls.createReviewComment({
      ...context.pullRequest(),
      body: "Thanks for closing this PR!",
    });
    ghPRComment(
      `Thanks for closing this issue! I will now delete the devbox associated with it.`,
      context
    );
    // Get all comments on the issue
    const comments = await context.octokit.issues.listComments({
      ...context.issue(),
    });

    comments.data.forEach(async (comment) => {
      // Regular expression to capture the devbox ID
      const regex = /Devbox 🤖 created with ID: \[(dbx_[a-zA-Z0-9]+)\]/;
      if (!comment.body) return;

      const match = comment.body.match(regex);
      if (match) {
        const devboxID = match[1]; // The first capture group contains the ID
        console.log("Devbox ID:", devboxID); // Outputs: Devbox ID: 12345
        if (devboxID) {
          try {
            await ghPRComment(
              `Your devbox \`${devboxID}\` is being deleted.`,
              context
            );
            await client.devboxes.shutdown(devboxID);

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
      }
    });
  });

  app.on("pull_request.opened", (context) => { pullRequestOpened(context) });

  app.on("pull_request.reopened", (context)=>{ pullRequestOpened(context) });


  async function pullRequestOpened (context: Context<"pull_request.opened"| "pull_request.reopened">
  ) {
    await ghPRComment(
      `Thanks for opening this issue! I will now create a devbox for you to operate on the code.`,
      context
    );

    try {
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
          `git clone ${context.payload.repository.clone_url}`,
        ],
      });

      // Add a label to the issue
      await context.octokit.issues.addLabels({
        ...context.issue(),
        labels: [`devbox-${devbox.id}`, "runloop"],
      });

      await awaitDevboxReady(devbox.id!, context, 10, 1000);

      await ghPRComment(
        `Devbox 🤖 created with ID: [${devbox.id}] is ready at [view devbox](https://platform.runloop.ai/devboxes/${devbox.id}), enjoy!\nAttempting to put the code on it.`,
        context
      );

      await client.devboxes.executeSync(devbox.id!, {
        command: `echo "Hello, World $GITHUB_ISSUE_NUMBER"`,
        shell_name: "bash",
      });

      await client.devboxes.executeSync(devbox.id!, {
        command: `cd ${context.payload.repository.name}`,
        shell_name: "bash",
      });

      await ghPRComment(`Installing and building`, context);
      await client.devboxes.executeSync(devbox.id!, {
        command: `npm i && npm run build`,
        shell_name: "bash",
      });

      await ghPRComment(`Running vite test`, context);
      const result = //await awaitCommandCompletion(
        await client.devboxes.executeSync(devbox.id!, {
          command: `npm run test`,
          shell_name: "bash",
        });
      //context
      //);

      await ghPRComment(
        `\#\#\# Test results
        \n\`\`\`${result.stdout}\`\`\``,
        context
      );
    } catch (e) {
      await ghPRComment(
        `Your devbox failed to start becasue of the following error: \n\`\`\`${e}\`\`\``,
        context
      );
      console.error("RunloopError:", e);
      return;
    }
  });
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
  devboxID: string,
  context: any,
  maxAttempts = 10,
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

    await ghPRComment(
      `Awaiting Devbox status: ${devbox.status} attempt: ${attempts + 1}`,
      context
    );
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(
    `Devbox ${devboxID} did not start after ${maxAttempts} attempts`
  );
}

async function ghPRComment(body: string, context: any) {
  return context.octokit.pulls.createReviewComment({
    ...context.pull_request,
    body,
  });
}
