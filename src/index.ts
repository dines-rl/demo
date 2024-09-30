import { Probot } from "probot";
import Runloop from "@runloop/api-client";

const client = new Runloop({
  bearerToken: process.env.RUNLOOP_KEY,
});
client.bearerToken;
console.log(`RLKEY (${client.bearerToken}):`, process.env.RUNLOOP_KEY);

export default (app: Probot) => {
  app.on("issues.closed", async (context) => {
    ghIssueComment(
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
      console.log(`Comment ${match?.length}:`, comment.body);
      if (match) {
        const devboxID = match[1]; // The first capture group contains the ID
        console.log("Devbox ID:", devboxID); // Outputs: Devbox ID: 12345
        if (devboxID) {
          try {
            await ghIssueComment(
              `Your devbox \`${devboxID}\` is being deleted.`,
              context
            );
            await client.devboxes.shutdown(devboxID);

            await ghIssueComment(
              `Your devbox \`${devboxID}\` has been deleted.`,
              context
            );
            console.log(`Devbox 🤖 with ID: [${devboxID}] deleted`);
          } catch (e) {
            ghIssueComment(
              `Your devbox \`${devboxID}\` failed to delete because of the following error: \n\`\`\`${e}\`\`\``,
              context
            );
            console.error("RunloopError:", e);
          }
        }
      } else {
        console.log("No devbox ID found in comment:", comment.body_text);
      }
    });
  });

  app.on("issues.opened", async (context) => {
    await ghIssueComment(
      `Thanks for opening this issue! I will now create a devbox for you to operate on the code.`,
      context
    );

    try {
      let devbox = await client.devboxes.create({
        name: `Issue-${context.payload.issue.number}`,
        launch_parameters: {
          keep_alive_time_seconds: 100 * 60,
        },
        environment_variables: {
          GITHUB_ISSUE_NUMBER: context.payload.issue.number.toString(),
          GITHUB_ISSUE_URL: context.payload.issue.html_url,
        },
        metadata: {
          github_issue_number: context.payload.issue.number.toString(),
          github_issue_url: context.payload.issue.html_url,
          github_issue_title: context.payload.issue.title,
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
        },
        setup_commands: [
          `echo 'Hello, World ${context.payload.issue.number}'`,
          `git clone ${context.payload.repository.clone_url}`,
        ],
      });

      await awaitDevboxReady(devbox.id!, 10, 1000);

      await ghIssueComment(
        `Devbox 🤖 created with ID: [${devbox.id}] is ready at [platform.runloop.ai](https://platform.runloop.ai/devboxes/${devbox.id}), enjoy! Attempting to put the code on it.`,
        context
      );

      await client.devboxes.executeAsync(devbox.id!, {
        command: `echo "Hello, World $GITHUB_ISSUE_NUMBER"`,
        shell_name: "bash",
      });

      await client.devboxes.executeAsync(devbox.id!, {
        command: `cd ${context.payload.repository.name}`,
        shell_name: "bash",
      });

      await client.devboxes.executeAsync(devbox.id!, {
        command: `npm i && npm run build`,
        shell_name: "bash",
      });

      const result = await client.devboxes.executeAsync(devbox.id!, {
        command: `npm run test`,
        shell_name: "bash",
      });
      await ghIssueComment("Test results: \n" + result.stdout, context);
    } catch (e) {
      await ghIssueComment(
        `Your devbox failed to start becasue of the following error: \n\`\`\`${e}\`\`\``,
        context
      );
      console.error("RunloopError:", e);
      return;
    }
  });
};

async function awaitDevboxReady(
  devboxID: string,
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
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(
    `Devbox ${devboxID} did not start after ${maxAttempts} attempts`
  );
}

async function ghIssueComment(body: string, context: any) {
  return context.octokit.issues.createComment({
    ...context.issue({ body: body }),
    body,
  });
}
