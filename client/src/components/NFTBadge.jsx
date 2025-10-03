import React from "react";
import { CHAIN_ID, NFT_ADDRESS } from "../eth";

export default function NFTBadge({ metadataCid, tokenId, className = "" }) {
  if (!metadataCid) return null;

  const isMainnet = Number(CHAIN_ID) === 1;
  const tokenHref = tokenId
    ? (isMainnet
        ? `https://opensea.io/assets/ethereum/${NFT_ADDRESS}/${tokenId}`
        : `https://sepolia.etherscan.io/token/${NFT_ADDRESS}?a=${tokenId}`)
    : `https://ipfs.io/ipfs/${metadataCid}`;

  return (
    <a
      className={`nft-chip ${className}`}
      href={tokenHref}
      target="_blank"
      rel="noreferrer"
      title={tokenId ? `Token #${tokenId}` : "View metadata on IPFS"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        fontSize: 12,
        borderRadius: 999,
        border: "1px solid #3a3a3a",
        background: "#121212",
        textDecoration: "none",
        color: "#fff",
      }}
    >
      <span style={{ fontWeight: 800 }}>NFT</span>
      {tokenId ? <span style={{ opacity: 0.85 }}>#{tokenId}</span> : <span style={{ opacity: 0.7 }}>metadata</span>}
    </a>
  );
}
