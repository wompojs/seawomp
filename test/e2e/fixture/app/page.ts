/* Home page — fully static (SSG). */
import { defineWompo, html } from 'wompo';

function HomePage() {
	return html`<h1 data-testid="home">Welcome to seawomp</h1>
		<p>Tiny fixture for e2e.</p>`;
}

defineWompo(HomePage, { name: 'fx-home-page' });
export default HomePage;
export const prerender = true;
