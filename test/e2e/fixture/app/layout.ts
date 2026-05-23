/* Root layout shared by every page in the fixture app. Provides a tiny nav so the e2e tests can
 * exercise client-side navigation. */
import { defineWompo, html } from 'wompo';

function RootLayout({ children }: any) {
	return html`
		<nav>
			<seawomp-link><a href="/">Home</a></seawomp-link>
			<seawomp-link><a href="/blog/1">Blog 1</a></seawomp-link>
			<seawomp-link><a href="/blog/2">Blog 2</a></seawomp-link>
			<seawomp-link><a href="/dashboard">Dashboard</a></seawomp-link>
		</nav>
		<main>${children}</main>
	`;
}

defineWompo(RootLayout, { name: 'fx-root-layout' });
export default RootLayout;
