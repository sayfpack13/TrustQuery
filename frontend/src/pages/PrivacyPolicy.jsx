// frontend/src/pages/PrivacyPolicy.jsx
import React from "react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto bg-background p-8 rounded-xl shadow-lg border border-border">
        <h1 className="text-4xl font-bold text-text mb-6">Privacy Policy</h1>
        <p className="text-muted mb-4 leading-relaxed">
          This Privacy Policy describes how your personal information is handled when you visit or make use of the TrustQuery.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">1. Information We Do Not Collect</h2>
        <p className="text-muted mb-4 leading-relaxed">
          This application is designed purely as a search tool. We prioritize your privacy and anonymity. As such, when you use the public search feature, we do <strong>not</strong> collect, store, or process any personal information about you, including:
        </p>
        <ul className="list-disc list-inside text-muted mb-4 ml-4 leading-relaxed">
          <li>Your IP address</li>
          <li>Your search queries</li>
          <li>Your browser type or operating system</li>
          <li>Any other unique identifiers</li>
        </ul>
        <p className="text-muted mb-4 leading-relaxed">
          Your searches are performed in a manner that does not link them back to you.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">2. Data We Process</h2>
        <p className="text-muted mb-4 leading-relaxed">
          This service processes various schemas from large datasets. We index this data solely to provide a search and management service for administrators.
        </p>
        <ul className="list-disc list-inside text-muted mb-4 ml-4 leading-relaxed">
          <li><strong>Type of Data:</strong> The indexed data consists of various schemas, which may include identifiers and associated information.</li>
          <li><strong>Purpose:</strong> To allow authorized users to search and manage data.</li>
        </ul>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">3. Data Security</h2>
        <p className="text-muted mb-4 leading-relaxed">
          We implement reasonable security measures to protect the integrity and availability of the indexed data.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">4. Changes to This Privacy Policy</h2>
        <p className="text-muted mb-4 leading-relaxed">
          We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
        </p>

      </div>
    </div>
  );
}