// contract/scripts/deploy.js
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const receiver = (process.env.ROYALTY_RECEIVER || "").trim();
  const bps = parseInt(process.env.ROYALTY_BPS || "500", 10);

  if (!receiver || !ethers.isAddress(receiver)) {
    throw new Error(`ROYALTY_RECEIVER missing/invalid: "${receiver}"`);
  }
  if (!(bps >= 0 && bps <= 10_000)) {
    throw new Error(`ROYALTY_BPS must be 0..10000 (got ${bps})`);
  }
  if (!process.env.SEPOLIA_RPC_URL || !process.env.PRIVATE_KEY) {
    throw new Error("Missing SEPOLIA_RPC_URL or PRIVATE_KEY in .env");
  }

  console.log("Deploying TaedalNFT with:");
  console.log("  receiver:", receiver);
  console.log("  bps     :", bps);

  const Factory = await hre.ethers.getContractFactory("TaedalNFT");
  const c = await Factory.deploy(receiver, bps);

  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("TaedalNFT deployed:", addr);

  try {
    await hre.run("verify:verify", {
      address: addr,
      constructorArguments: [receiver, bps],
    });
    console.log("Verified on Etherscan");
  } catch (e) {
    console.log("Verify skipped/failed:", e.message || e);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
