// scripts/whoami.js
require("dotenv").config();
const { Wallet } = require("ethers");
const pk = process.env.PRIVATE_KEY;
if (!pk) throw new Error("PRIVATE_KEY missing from .env");
const wallet = new Wallet(pk);
console.log("Deployer address:", wallet.address);
