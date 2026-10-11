import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STATE_FILE = process.env.BOT_STATE_FILE || "/data/solanatokenfactory-bot-state.json";
const START_CAPITAL_BRL = Number(process.env.INITIAL_CAPITAL_BRL ?? 100);
const TARGET_RECOVERY_BRL = Number(process.env.TARGET_PROCEEDS_BRL ?? 195);

function blankState() {
  return {
    running: false,
    mode: "simulation",
    initialCapitalBrl: START_CAPITAL_BRL,
    targetRecoveryBrl: TARGET_RECOVERY_BRL,
    cycle: 0,
    activeToken: null,
    tokens: [],
    events: [],
    updatedAt: new Date().toISOString()
  };
}
async function loadState() {
  try {
    return { ...blankState(), ...JSON.parse(await readFile(STATE_FILE, "utf8")) };
  } catch {
    return blankState();
  }
}
async function saveState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  state.updatedAt = new Date().toISOString();
  const tmp = STATE_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  const { rename } = await import("node:fs/promises");
  await rename(tmp, STATE_FILE);
}
function generatedToken(cycle) {
  const names = ["Nova Aurora", "Pixel Verde", "Lunar Spark", "Orbe Digital", "Nébula Azul", "Sol Rise"];
  const symbols = ["NOVA", "PVER", "LUNR", "ORBE", "NEBU", "RISE"];
  const index = Math.floor(Math.random() * names.length);
  const name = names[index] + " " + cycle;
  const symbol = symbols[index] + cycle;
  const description = name + " é um token experimental gerado pelo SolanaTokenFactory em modo de simulação. Não representa um ativo negociável nem possui valor financeiro real.";
  const color = ["#14f195", "#6c8cff", "#d18bff", "#ffbf69", "#60d6d6"][index % 5];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g"><stop stop-color="' + color + '"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="512" height="512" rx="80" fill="#0b1020"/><circle cx="256" cy="220" r="150" fill="url(#g)"/><path d="M170 250 L256 120 L342 250 L256 320 Z" fill="#fff" fill-opacity=".85"/><text x="256" y="430" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#fff">' + symbol + '</text></svg>';
  return { id: randomUUID(), cycle, name, symbol, description, imageSvg: svg, imageDataUrl: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"), status: "simulated", initialCapitalBrl: START_CAPITAL_BRL, simulatedValueBrl: START_CAPITAL_BRL, simulatedProceedsBrl: 0, createdAt: new Date().toISOString(), network: "simulation" };
}
export async function getBotState() {
  const state = await loadState();
  return publicState(state);
}
function publicState(state) {
  return {
    running: state.running,
    mode: "simulation",
    initialCapitalBrl: state.initialCapitalBrl,
    targetRecoveryBrl: state.targetRecoveryBrl,
    cycle: state.cycle,
    activeToken: state.activeToken,
    tokens: state.tokens.map(({ imageDataUrl, ...token }) => token),
    events: state.events.slice(-30),
    updatedAt: state.updatedAt,
    note: "Simulação: não envia transações, não cria tokens on-chain e não gera lucro real."
  };
}
export async function startBot() {
  const state = await loadState();
  if (state.running) return publicState(state);
  state.running = true;
  state.events.push({ at: new Date().toISOString(), type: "started", message: "Robô ligado em modo de simulação." });
  if (!state.activeToken) {
    state.cycle += 1;
    state.activeToken = generatedToken(state.cycle);
    state.tokens.unshift(state.activeToken);
    state.events.push({ at: new Date().toISOString(), type: "created", message: "Token simulado criado automaticamente: " + state.activeToken.name });
  }
  await saveState(state);
  return publicState(state);
}
export async function stopBot() {
  const state = await loadState();
  state.running = false;
  state.events.push({ at: new Date().toISOString(), type: "stopped", message: "Robô pausado. Nenhuma venda foi executada." });
  await saveState(state);
  return publicState(state);
}
export async function simulateRecovery(proceedsBrl) {
  const state = await loadState();
  if (!state.running) throw new Error("Ligue o robô antes de registrar uma simulação.");
  if (!Number.isFinite(proceedsBrl) || proceedsBrl < 0) throw new TypeError("Valor simulado inválido.");
  if (!state.activeToken) throw new Error("Não há token simulado ativo.");
  state.activeToken.simulatedProceedsBrl += proceedsBrl;
  if (state.activeToken.simulatedProceedsBrl >= state.targetRecoveryBrl) {
    state.activeToken.status = "target_reached_simulated";
    state.activeToken.closedAt = new Date().toISOString();
    state.events.push({ at: new Date().toISOString(), type: "target", message: "Meta de recuperação simulada atingida; encerrando ciclo e criando o próximo." });
    state.activeToken = null;
    state.cycle += 1;
    state.activeToken = generatedToken(state.cycle);
    state.tokens.unshift(state.activeToken);
    state.events.push({ at: new Date().toISOString(), type: "created", message: "Novo token simulado criado: " + state.activeToken.name });
  }
  await saveState(state);
  return publicState(state);
}
