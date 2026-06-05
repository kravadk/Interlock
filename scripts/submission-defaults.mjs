export const defaultDashboardUrl = "https://mantle-nine-beta.vercel.app";
export const defaultRepoUrl = "TODO: add GitHub repository URL";
export const defaultDemoVideoUrl = "TODO: add demo video URL";

export function liveBundleCommand() {
  return `pnpm submission:bundle:live -- --repo-url <PUBLIC_GITHUB_URL> --dashboard-url ${defaultDashboardUrl} --demo-video-url <DEMO_VIDEO_URL>`;
}
