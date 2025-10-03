import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Navbar from "./components/Navbar";
import NftBadge from "./components/NFTBadge";
const API = "http://localhost:5000";

export default function ArtPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/artwork/${id}/full`, { credentials: "include" })
      .then(r=>r.json())
      .then(setData)
      .catch(()=>setData({ ok:false }));
  }, [id]);

  const art = data?.artwork;
  if (!art) return (
    <div>
      <Navbar />
      <div className="container" style={{maxWidth:960, margin:"40px auto"}}>Loading…</div>
    </div>
  );

  return (
    <div>
      <Navbar />
      <main className="container" style={{maxWidth:960, margin:"20px auto"}}>
        <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:24}}>
          <img src={`${API}/uploads/${art.image_file}`} alt={art.title} style={{width:"100%", borderRadius:12}} />
          <div>
            <h1 style={{marginTop:0}}>{art.title}</h1>
            <NftBadge metadataCid={art.metadata_cid} tokenId={art.token_id} />
            <p style={{marginTop:12, whiteSpace:"pre-wrap"}}>{art.description}</p>
            <div style={{marginTop:16, opacity:.8}}>
              By @{data?.artwork?.username}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
