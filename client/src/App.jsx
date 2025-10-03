// client/src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Navbar from "./components/Navbar";
import Home from "./Home";
import Community from "./Community";
import Mint from "./Mint";               // legacy page (optional)
import Account from "./Account";
import ProfilePage from "./ProfilePage";
import UserProfile from "./UserProfile";
import Contracts from "./Contracts";
import ContractsEdit from "./ContractsEdit";
import ContractsReview from "./ContractsReview";
import ArtPage from "./ArtPage";
import VerifyPage from "./VerifyPage";

// Upload flow pages
import UploadStep1 from "./pages/UploadStep1";
import UploadStep2 from "./pages/UploadStep2";
import PricingStep3 from "./pages/PricingStep3";
import UploadStep4 from "./pages/UploadStep4";
import ReviewStep5 from "./pages/ReviewStep5";

// Listing (new)
import ListingPage from "./pages/ListingPage";

// Auth
import Login from "./Login";
import Signup from "./Signup";

export default function App() {
  return (
    <>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />

        {/* main nav destinations */}
        <Route path="/community" element={<Community />} />
        <Route path="/listings/new" element={<Mint />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/account" element={<Account />} />

        {/* auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* contracts */}
        <Route path="/contracts/new" element={<ContractsEdit />} />
        <Route path="/contracts/:id" element={<ContractsReview />} />

        {/* artwork & verification */}
        <Route path="/art/:id" element={<ArtPage />} />
        {/* Support both :tokenId and :ref so we can handle numeric IDs or CIDs */}
        <Route path="/verify/:tokenId" element={<VerifyPage />} />
        <Route path="/verify/:ref" element={<VerifyPage />} />

        {/* upload flow */}
        <Route path="/upload/start" element={<UploadStep1 />} />
        <Route path="/upload/details" element={<UploadStep2 />} />
        <Route path="/upload/pricing" element={<PricingStep3 />} />
        <Route path="/upload/confirm" element={<UploadStep4 />} />
        <Route path="/upload/step4" element={<UploadStep4 />} />
        <Route path="/upload/review" element={<ReviewStep5 />} />
        {/* convenience redirect */}
        <Route path="/upload" element={<Navigate to="/upload/start" replace />} />

        {/* listing view */}
        <Route path="/listing/:id" element={<ListingPage />} />
        <Route path="/verify/:tokenId" element={<VerifyPage />} />
        <Route path="/verify/:ref" element={<VerifyPage />} />


        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
