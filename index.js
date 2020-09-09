const core = require('@actions/core');
const github = require('@actions/github');
const context = github.context;

async function run() {
  try {
    const octokit = github.getOctokit(core.getInput('token'));
    const issue = context.payload.issue;

    core.info(`Action: ${context.payload.action}`);

    if (issue.state !== 'open') {
      core.info('This is not an open issue.');
      return 0;
    }

    if (!issue.title.startsWith('Verify: Project')) {
      core.info('This does not appear to be a project verification issue.');
      return 0;
    }

    let comment = {
      owner: context.payload.organization.login,
      repo: context.payload.repository.name,
      issue_number: context.issue.number
    };

    let status = {
      owner: context.payload.organization.login,
      repo: context.payload.repository.name,
      issue_number: context.issue.number
    };

    let pattern = /Verify: Project (v(\d)\.(\d+)\.(\d+))/;
    let tokens = issue.title.match(pattern);

    core.info(tokens);

    if (tokens === null) {
      comment.body = `## :warning: Warning\n\n The issue title \`${issue.title}\` is in an unexpected format. Please re-open this issue once fixed. (All other checks skipped.)`;
      status.state = 'closed';

      await octokit.issues.createComment(comment);
      await octokit.issues.update(status);

      core.info(comment.body);
      return 0;
    }

    let messages = [];
    let okay = true;

    let project = tokens[2];
    let milestone = `Project ${project}`;
    let assignee = 'josecorella';
    let labels = new Set(['verify', `project${project}`]);

    if (issue.milestone === null || issue.milestone.title != milestone) {
      messages.push(`The issue is missing the \`${milestone}\` milestone.`);
    }

    if (issue.assignees.length < 1) {
      messages.push(`Please assign \`${assignee}\` to this issue.`);
    }
    else if (issue.assignees.length > 1) {
      messages.push(`There should be only 1 assignee. Please remove all assignees except for \`${assignee}\` from this issue.`);
    }
    else if (issue.assignees[0].login != assignee) {
      messages.push(`This issue is not assigned correctly. Please remove assignee \`${issue.assignees[0].login}\` and add \`${assignee}\` instead.`);
    }

    for (const label of issue.labels) {
      if (labels.has(label.name)) {
        labels.delete(label.name);
      }
      else {
        messages.push(`The label \`${label.name}\` is unexpected. Please remove.`);
      }
    }

    for (const label of labels) {
      messages.push(`The label \`${label}\` is missing. Please add this label.`);
    }

    if (messages.length > 0) {
      comment.body = `## :warning: Warning\n\n **One or more issues detected!**\n\n  - ${messages.join('\n  - ')}\n\nPlease re-open this issue once all of the above is fixed.`;
      status.state = 'closed';
    }
    else {
      const runs = await octokit.actions.listWorkflowRuns({
        owner: context.payload.organization.login,
        repo: context.payload.repository.name,
        workflow_id: 'verify.yml',
        event: 'release',
        status: 'success'
      });

      const release = tokens[1];
      const found = runs.data.workflow_runs.find(r => r.head_branch === release);

      if (found === undefined) {
        comment.body = `## :stop_sign: Release Not Verified\n\nUnable to find a successful workflow run that matches the \`${release}\` release. Please successfully run the "Verify Project" workflow before re-opening this issue.`
        status.state = 'closed';
      }
      else {
        comment.body = `## :tada: Release Verified!\n\nIdentified [passing workflow run](${found.html_url}) for the \`${release}\` release.`
        status.state = 'open';
      }
    }

    await octokit.issues.createComment(comment);
    await octokit.issues.update(status);

    core.info(comment.body);
    core.info(`Done. Workflow: ${context.workflow}, Job: ${context.job}, Run ID: ${context.runId}, Run Number: ${context.runNumber}`);
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run();
