import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSplTokenOnDevnet } from "./solana-devnet.js";

const STATE_FILE = process.env.BOT_STATE_FILE || "/data/solanatokenfactory-bot-state.json";
const START_CAPITAL_BRL = Number(process.env.INITIAL_CAPITAL_BRL ?? 100);
const TARGET_RECOVERY_BRL = Number(process.env.TARGET_PROCEEDS_BRL ?? 195);

// Professional concept brands for the simulator. These are concepts, not live projects.
const BRAND_CONCEPTS = [
  {
    name: "Aureon Network", symbol: "AURN", palette: ["#d6b36a", "#6e5428", "#f7e6b1"],
    tagline: "Infraestrutura digital para uma economia aberta.",
    description: "Aureon Network (AURN) é um conceito de ativo digital criado para demonstrar a experiência de emissão, identificação e acompanhamento de tokens na Solana. Este projeto de demonstração não representa uma empresa em operação, não promete retorno financeiro e não possui liquidez garantida."
  },
  {
    name: "Nexora Protocol", symbol: "NEXR", palette: ["#6ca8ff", "#243d8b", "#d9e8ff"],
    tagline: "Conectividade. Transparência. Escala.",
    description: "Nexora Protocol (NEXR) é um conceito de token para demonstração de ferramentas Web3 e acompanhamento on-chain. A identidade visual e os metadados são gerados automaticamente pelo SolanaTokenFactory. Trata-se de uma demonstração experimental, sem promessa de rendimento, utilidade ativa ou liquidez garantida."
  },
  {
    name: "Veridian Labs", symbol: "VRDN", palette: ["#52d6a1", "#145c4b", "#d9fff0"],
    tagline: "Tecnologia aberta para ativos digitais.",
    description: "Veridian Labs (VRDN) é um conceito de ativo digital criado em ambiente de simulação para testar metadados, identidade visual e monitoramento de tokens na Solana. Não representa participação societária, não oferece retorno garantido e não deve ser tratado como investimento real."
  },
  {
    name: "Altaris Digital", symbol: "ALTS", palette: ["#b9a0ff", "#49318a", "#eee7ff"],
    tagline: "Uma nova perspectiva para ativos digitais.",
    description: "Altaris Digital (ALTS) é um projeto conceitual utilizado para demonstrar a criação e o acompanhamento de tokens. Nome, símbolo, descrição e arte são gerados automaticamente para fins de teste. O conceito não possui mercado, liquidez ou desempenho financeiro real assegurados."
  },
  {
    name: "Meridian Chain", symbol: "MRDN", palette: ["#56d8e8", "#145b76", "#e1fbff"],
    tagline: "Dados claros. Ativos digitais.",
    description: "Meridian Chain (MRDN) é um conceito experimental de token focado na demonstração de transparência de dados e identificação on-chain. Este ativo de teste não está associado a um produto comercial ativo, não garante liquidez e não oferece qualquer promessa de lucro."
  },
  {
    name: "Solstice Finance", symbol: "SLST", palette: ["#ffad76", "#8c3e31", "#fff0e5"],
    tagline: "Design sólido para experiências Web3.",
    description: "Solstice Finance (SLST) é um conceito visual de ativo digital usado para validar fluxos automatizados de criação e acompanhamento na Solana. O projeto é demonstrativo, não presta serviços financeiros, não possui rendimento garantido e não deve ser confundido com um protocolo financeiro em operação."
  }
];

function blankState() {
  return {
    running: false,
    mode: "devnet",
    initialCapitalBrl: START_CAPITAL_BRL,
    targetRecoveryBrl: TARGET_RECOVERY_BRL,
    cycle: 0,
    activeToken: null,
    awaitingConfirmedProceeds: false,
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
  await rename(tmp, STATE_FILE);
}
function generatedToken(cycle) {
  const concept = BRAND_CONCEPTS[(cycle - 1) % BRAND_CONCEPTS.length];
  const name = concept.name;
  const symbol = concept.symbol;
  const [accent, deep, pale] = concept.palette;
  const initials = name.split(/\\s+/).map(part => part[0]).join("").slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080d1b"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${pale}"/><stop offset=".52" stop-color="${accent}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".26"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="160" fill="url(#bg)"/>
  <circle cx="512" cy="420" r="360" fill="url(#glow)"/>
  <circle cx="512" cy="420" r="250" fill="none" stroke="${accent}" stroke-opacity=".38" stroke-width="3"/>
  <circle cx="512" cy="420" r="210" fill="none" stroke="${pale}" stroke-opacity=".18" stroke-width="2"/>
  <path d="M512 205 L700 314 L700 526 L512 635 L324 526 L324 314 Z" fill="none" stroke="url(#metal)" stroke-width="18" stroke-linejoin="round"/>
  <path d="M512 278 L637 350 L637 490 L512 562 L387 490 L387 350 Z" fill="url(#metal)" fill-opacity=".12" stroke="url(#metal)" stroke-width="8" stroke-linejoin="round"/>
  <path d="M512 328 L590 420 L512 512 L434 420 Z" fill="url(#metal)"/>
  <circle cx="512" cy="420" r="20" fill="#ffffff"/>
  <text x="512" y="760" font-family="Arial,sans-serif" font-size="66" font-weight="700" letter-spacing="9" text-anchor="middle" fill="#ffffff">${symbol}</text>
  <path d="M300 806 H724" stroke="${accent}" stroke-opacity=".65" stroke-width="3"/>
  <text x="512" y="858" font-family="Arial,sans-serif" font-size="24" letter-spacing="5" text-anchor="middle" fill="${pale}" fill-opacity=".85">DIGITAL ASSET CONCEPT</text>
</svg>`;
  return {
    id: randomUUID(), cycle, name, symbol,
    tagline: concept.tagline,
    description: concept.description,
    imageSvg: svg,
    imageDataUrl: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
    status: "simulated",
    initialCapitalBrl: START_CAPITAL_BRL,
    simulatedValueBrl: START_CAPITAL_BRL,
    simulatedProceedsBrl: 0,
    createdAt: new Date().toISOString(),
    network: "simulation"
  };
}
export async function getBotState() {
  const state = await loadState();
  return publicState(state);
}
function publicState(state) {
  return {
    running: state.running,
    mode: state.mode || "devnet",
    initialCapitalBrl: state.initialCapitalBrl,
    targetRecoveryBrl: state.targetRecoveryBrl,
    cycle: state.cycle,
    activeToken: state.activeToken,
    awaitingConfirmedProceeds: Boolean(state.awaitingConfirmedProceeds),
    tokens: state.tokens.map(({ imageDataUrl, ...token }) => token),
    events: state.events.slice(-30),
    updatedAt: state.updatedAt,
    note: "Tokens são criados on-chain na Solana Devnet. Vendas e recuperação financeira ainda são simuladas; não há operação com dinheiro real."
  };
}
async function createTokenOnDevnet(token) {
  const result = await createSplTokenOnDevnet({
    initialSupply: process.env.BOT_INITIAL_SUPPLY || "1000",
    decimals: Number(process.env.BOT_TOKEN_DECIMALS ?? 6),
    name: token.name,
    symbol: token.symbol,
    description: token.description,
    imageDataUrl: token.imageDataUrl,
    imageFileName: token.symbol.toLowerCase() + ".svg"
  });
  Object.assign(token, {
    status: "created_on_devnet",
    network: "devnet",
    mintAddress: result.mintAddress,
    tokenAccount: result.tokenAccount,
    ownerAddress: result.ownerAddress,
    initialSupply: result.initialSupply,
    decimals: result.decimals,
    imageUri: result.imageUri,
    metadataUri: result.metadataUri,
    signature: result.signature,
    explorerUrl: result.explorerUrl,
    confirmed: result.confirmed,
    createdOnChainAt: new Date().toISOString()
  });
  return token;
}
export async function startBot() {
  const state = await loadState();
  if (state.running) return publicState(state);
  if (state.awaitingConfirmedProceeds) {
    // A manual restart may create the next TEST token on Devnet, but it is never treated as a real financial cycle.
    state.awaitingConfirmedProceeds = false;
    state.events.push({ at: new Date().toISOString(), type: "test_cycle_restart", message: "Novo ciclo de TESTE autorizado manualmente. Nome, símbolo, descrição e imagem serão alternados; recebimento permanece simulado." });
  }
  if (!state.activeToken) {
    const nextCycle = state.cycle + 1;
    const token = generatedToken(nextCycle);
    // Only mark the cycle active after metadata and token are confirmed on Devnet.
    await createTokenOnDevnet(token);
    state.cycle = nextCycle;
    state.activeToken = token;
    state.tokens.unshift(token);
    state.events.push({ at: new Date().toISOString(), type: "created_on_devnet", message: "Token criado e confirmado na Solana Devnet: " + token.name + " (" + token.symbol + ") · " + token.mintAddress });
  } else if (state.activeToken.network !== "devnet" || !state.activeToken.confirmed) {
    await createTokenOnDevnet(state.activeToken);
    state.events.push({ at: new Date().toISOString(), type: "created_on_devnet", message: "Token criado e confirmado na Solana Devnet: " + state.activeToken.name + " · " + state.activeToken.mintAddress });
  }
  state.running = true;
  state.mode = "devnet";
  state.events.push({ at: new Date().toISOString(), type: "started", message: "Robô ligado. Criação on-chain habilitada somente na Devnet; vendas ainda não automatizadas." });
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
    state.events.push({ at: new Date().toISOString(), type: "target_simulated", message: "Meta simulada atingida. Nenhum próximo token foi criado: a confirmação de venda e recebimento real ainda não está integrada." });
    // Simulation must never trigger another on-chain token creation.
    state.activeToken = null;
    state.awaitingConfirmedProceeds = true;
    state.running = false;
  }
  await saveState(state);
  return publicState(state);
}
