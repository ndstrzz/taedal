import { ethers } from "ethers";

// Works with CRA (REACT_APP_*) and Vite (VITE_*)
const CRA  = typeof process !== "undefined" ? process.env : {};
const VITE = typeof import.meta !== "undefined" ? import.meta.env : {};

// Optional fallback via localStorage (handy in dev without rebuilds)
const LS_ADDR =
  typeof localStorage !== "undefined" ? localStorage.getItem("NFT_ADDRESS") : "";

// ----- Resolved config -----
export const NFT_ADDRESS =
  CRA?.REACT_APP_NFT_ADDRESS || VITE?.VITE_NFT_ADDRESS || LS_ADDR || "";

export const CHAIN_ID = Number(
  CRA?.REACT_APP_CHAIN_ID || VITE?.VITE_CHAIN_ID || 11155111 // Sepolia default
);

// Public chain metadata (Sepolia default; add more if needed)
const CHAIN = {
  11155111: {
    chainIdHex: "0xaa36a7",
    chainName: "Sepolia",
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerTx: "https://sepolia.etherscan.io/tx/",
    blockExplorerToken: "https://sepolia.etherscan.io/token/",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
};

// ----- TaedalNFT minimal ABI (event + mint function we use) -----
const TAEDAL_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: "address", name: "minter",    type: "address" },
      { indexed: true,  internalType: "uint256", name: "artworkId", type: "uint256" },
      { indexed: true,  internalType: "uint256", name: "tokenId",   type: "uint256" },
      { indexed: false, internalType: "string",  name: "tokenURI",  type: "string"  }
    ],
    name: "ArtworkLinked",
    type: "event"
  },
  {
    inputs: [
      { internalType: "string",  name: "uri",       type: "string"  },
      { internalType: "uint256", name: "artworkId", type: "uint256" }
    ],
    name: "mintWithURI",
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// ----------------- Wallet helpers -----------------
export async function connect() {
  if (!window.ethereum) throw new Error("No EIP-1193 provider found");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  return accounts[0] || null;
}

export async function getAccount() {
  if (!window.ethereum) return null;
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  return accounts[0] || null;
}

export async function getChainId() {
  if (!window.ethereum) return null;
  const hex = await window.ethereum.request({ method: "eth_chainId" });
  return parseInt(hex, 16);
}

export async function switchChain(targetChainId) {
  if (!window.ethereum) throw new Error("No EIP-1193 provider found");
  const hex = "0x" + Number(targetChainId).toString(16);
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (e) {
    if (e?.code === 4902) {
      // Add then switch
      const cfg = CHAIN[targetChainId];
      if (!cfg) throw e;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [cfg],
      });
    } else {
      throw e;
    }
  }
}

// Prefer MetaMask if multiple injected providers
function getInjectedProvider() {
  const eth = window.ethereum;
  if (!eth) return undefined;
  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p) => p.isMetaMask);
    return mm || eth.providers[0];
  }
  return eth;
}

async function ensureChain(provider) {
  const target = CHAIN[CHAIN_ID];
  if (!target) return;
  const current = await provider.send("eth_chainId", []);
  if (current === target.chainIdHex) return;

  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: target.chainIdHex }]);
  } catch (err) {
    if (err?.code === 4902) {
      await provider.send("wallet_addEthereumChain", [target]);
    } else {
      throw err;
    }
  }
}

// --------------- Public helpers for UI ---------------
export function txUrl(txHash) {
  const base = CHAIN[CHAIN_ID]?.blockExplorerTx || "https://sepolia.etherscan.io/tx/";
  return `${base}${txHash}`;
}

export function tokenUrl(tokenId) {
  if (!tokenId) return null;
  const base = CHAIN[CHAIN_ID]?.blockExplorerToken || "https://sepolia.etherscan.io/token/";
  return `${base}${NFT_ADDRESS}?a=${tokenId}`;
}

// --------------- Main: mint on chain ----------------
/**
 * Always returns a tokenId:
 * - predict via callStatic.mintWithURI (pre-tx)
 * - parse ArtworkLinked or Transfer event (post-tx)
 * - fallback to predicted if events missing
 */
export async function mintOnChain(tokenURI, artworkId = 0) {
  if (!NFT_ADDRESS) throw new Error("NFT contract address is not configured");

  const injected = getInjectedProvider();
  if (!injected) throw new Error("No Ethereum wallet found (install MetaMask)");

  const provider = new ethers.providers.Web3Provider(injected);
  await provider.send("eth_requestAccounts", []);
  await ensureChain(provider);

  const signer = provider.getSigner();
  const contract = new ethers.Contract(NFT_ADDRESS, TAEDAL_ABI, signer);

  // 1) Predict tokenId deterministically
  let predictedId = null;
  try {
    const pred = await contract.callStatic.mintWithURI(tokenURI, artworkId);
    predictedId = pred?.toString?.() || null;
  } catch {
    // some contracts may revert in static if they enforce msg.sender/state; ignore
  }

  // 2) Send tx
  const tx = await contract.mintWithURI(tokenURI, artworkId);
  const receipt = await tx.wait();

  // 3) Extract from logs
  let tokenId = null;
  try {
    for (const log of receipt.logs || []) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "ArtworkLinked") {
          tokenId = parsed.args.tokenId.toString();
          break;
        }
      } catch { /* non-matching log */ }
    }

    if (!tokenId && receipt.events) {
      const mintEvt = receipt.events.find(
        (ev) => ev.event === "Transfer" && ev.args?.from === ethers.constants.AddressZero
      );
      tokenId = mintEvt?.args?.tokenId?.toString() || null;
    }
  } catch { /* ignore */ }

  // 4) Fallback to predicted if needed
  if (!tokenId && predictedId) tokenId = predictedId;

  // 5) Persist convenience values
  try {
    if (tokenId != null) localStorage.setItem("lastTokenId", String(tokenId));
    if (receipt?.transactionHash) localStorage.setItem("lastTxHash", receipt.transactionHash);
    if (NFT_ADDRESS) localStorage.setItem("lastContract", NFT_ADDRESS);
  } catch {}

  return {
    hash: receipt.transactionHash,
    etherscan: txUrl(receipt.transactionHash),
    tokenId,
  };
}

// Debug: expose resolved values
if (typeof window !== "undefined") window.__TAEDAL = { NFT_ADDRESS, CHAIN_ID };

// Helpful warning in dev
if (!NFT_ADDRESS) {
  // eslint-disable-next-line no-console
  console.warn("[eth] NFT_ADDRESS is empty. Set client/.env and restart, OR run:");
  // eslint-disable-next-line no-console
  console.warn("localStorage.setItem('NFT_ADDRESS','0xYOUR_DEPLOYED_ADDRESS')");
}
