// client/src/web3/mint.js
import { BrowserProvider, Contract } from "ethers";
import abi from "./taedalNFTAbi.json";

const CONTRACT_ADDRESS =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_NFT_ADDRESS) ||
  process.env.REACT_APP_NFT_ADDRESS;

export async function mintWithMetaMask(tokenURI) {
  if (!window.ethereum) throw new Error("MetaMask not found");
  if (!CONTRACT_ADDRESS) throw new Error("Missing contract address env");

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const me = await signer.getAddress();

  const contract = new Contract(CONTRACT_ADDRESS, abi, signer);
  // If your contract’s function is different, adjust here:
  const tx = await contract.safeMint(me, tokenURI);
  const receipt = await tx.wait();
  return receipt;
}
