const { Web3Storage, File: Web3File } = (() => {
  try { return require("web3.storage"); } catch { return {}; }
})();
const { NFTStorage, File: NFTFile } = (() => {
  try { return require("nft.storage"); } catch { return {}; }
})();
const axios = require("axios");
const FormData = require("form-data");

const WEB3_STORAGE_TOKEN = process.env.WEB3_STORAGE_TOKEN || "";
const CLASSIC_NFT_STORAGE_TOKEN = process.env.CLASSIC_NFT_STORAGE_TOKEN || "";
const PINATA_JWT = process.env.PINATA_JWT || "";

const web3Client = WEB3_STORAGE_TOKEN ? new Web3Storage({ token: WEB3_STORAGE_TOKEN }) : null;
const nftClient  = CLASSIC_NFT_STORAGE_TOKEN ? new NFTStorage({ token: CLASSIC_NFT_STORAGE_TOKEN }) : null;

async function uploadToIPFS(data, filename, mimetype) {
  if (web3Client && Web3File) {
    try {
      const file = new Web3File([data], filename || "bin", { type: mimetype || "application/octet-stream" });
      const cid = await web3Client.put([file], { name: `taedal-${Date.now()}` });
      return { cid, provider: "web3", url: `https://w3s.link/ipfs/${cid}/${encodeURIComponent(filename || "bin")}` };
    } catch (e) { console.error("Web3.Storage upload failed:", e.message); }
  }
  if (nftClient && NFTFile) {
    try {
      const file = new NFTFile([data], filename || "bin", { type: mimetype || "application/octet-stream" });
      const cid = await nftClient.storeBlob(file);
      return { cid, provider: "nft", url: `https://ipfs.io/ipfs/${cid}` };
    } catch (e) { console.error("NFT.Storage upload failed:", e.message); }
  }
  if (PINATA_JWT) {
    try {
      const form = new FormData();
      form.append("file", data, { filename: filename || "bin", contentType: mimetype || "application/octet-stream" });
      const resp = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
        maxBodyLength: Infinity,
        headers: { Authorization: `Bearer ${PINATA_JWT}`, ...form.getHeaders() },
      });
      if (resp.status === 200 && resp.data?.IpfsHash) {
        const cid = resp.data.IpfsHash;
        return { cid, provider: "pinata", url: `https://gateway.pinata.cloud/ipfs/${cid}` };
      }
    } catch (e) { console.error("Pinata upload failed:", e.message); }
  }
  return { cid: null, provider: null, url: null };
}

async function pinJSONToIPFS(json) {
  if (!PINATA_JWT) return null;
  const res = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", json, {
    headers: { Authorization: `Bearer ${PINATA_JWT}`, "Content-Type": "application/json" },
  });
  return res.data?.IpfsHash || null;
}

module.exports = { uploadToIPFS, pinJSONToIPFS };
