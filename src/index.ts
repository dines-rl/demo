import { Probot } from "probot";
import Runloop from "@runloop/api-client";

const client = new Runloop({
  bearerToken: process.env.RUNLOOP_KEY,
});
client.bearerToken;
console.log(`RLKEY (${client.bearerToken}):`, process.env.RUNLOOP_KEY);

export default (app: Probot) => {
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
          `cd ${context.payload.repository.name}`,
          `ls -la`,
          `npm i && npm run build`,
          `node lib/treesitter.js src/index.ts ast-${context.payload.repository.full_name}.json`,
          `cat ast-${context.payload.repository.full_name}.json`,
        ],
        // code_mounts: [
        //   {
        //     repository: "https://github.com/runloopai/rl-cli",
        //     path: "/home/user/runloop"
        //   }
        // ]
      });

      await ghIssueComment(
        `Your devbox \`${devbox.id}\` is ready at [platform.runloop.ai](https://platform.runloop.ai/devboxes/${devbox.id}), enjoy! Attempting to put the code on it.`,
        context
      );
      // setTimeout(async () => {
      //   await client.devboxes.executeAsync(devbox.id, {
      //     code: `echo 'Hello, World ${context.payload.issue.number}'`,
      // }, 5000);
      console.log(`Devbox 🤖 created with ID: ${devbox.id}`);
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

async function ghIssueComment(body: string, context: any) {
  return context.octokit.issues.createComment({
    ...context.issue({ body: body }),
    body,
  });
}
