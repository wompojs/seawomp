/* Dashboard — three islands, one per hydration mode. */
import { defineWompo, html, useState } from 'wompo';

function CounterLoad({ start = 0 }: any) {
  const [n, setN] = useState(start);
  return html`<button data-testid="island-load" @click=${() => setN(n + 1)}>load: ${n}</button>`;
}
defineWompo(CounterLoad, { name: 'fx-counter-load', island: 'load' });

function CounterIdle({ start = 0 }: any) {
  const [n, setN] = useState(start);
  return html`<button data-testid="island-idle" @click=${() => setN(n + 1)}>idle: ${n}</button>`;
}
defineWompo(CounterIdle, { name: 'fx-counter-idle', island: 'idle' });

function CounterVisible({ start = 0 }: any) {
  const [n, setN] = useState(start);
  return html`<button data-testid="island-visible" @click=${() => setN(n + 1)}>visible: ${n}</button>`;
}
defineWompo(CounterVisible, { name: 'fx-counter-visible', island: 'visible' });

function Dashboard() {
  return html`
    <section data-testid="dashboard">
      <h1>Dashboard</h1>
      <${CounterLoad} start=${10} />
      <${CounterIdle} start=${20} />
      <div style=${{ height: '120vh' }}></div>
      <${CounterVisible} start=${30} />
    </section>
  `;
}
defineWompo(Dashboard, { name: 'fx-dashboard' });
export default Dashboard;
