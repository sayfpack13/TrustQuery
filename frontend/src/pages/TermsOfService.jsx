import React from "react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background py-16 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto bg-background p-8 rounded-xl shadow-lg border border-border backdrop-filter backdrop-blur-sm">
        <h1 className="text-4xl font-bold text-text mb-6">Terms of Service</h1>
        <p className="text-muted mb-4 leading-relaxed">
          Welcome to the TrustQuery. These Terms of Service ("Terms") govern your access to and use of our service. By accessing or using the service, you agree to be bound by these Terms.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">1. Acceptance of Terms</h2>
        <p className="text-muted mb-4 leading-relaxed">
          By using our service, you acknowledge that you have read, understood, and agree to be bound by these Terms, as well as our Privacy Policy and Disclaimer.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">2. Nature of the Service</h2>
        <p className="text-muted mb-4 leading-relaxed">
          This service provides a scalable and fast search and management engine for large datasets. It is intended for use by authorized administrators and moderators.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">3. Prohibited Uses</h2>
        <p className="text-muted mb-4 leading-relaxed">
          You may use the service only for lawful purposes and in accordance with these Terms. You agree not to use the service:
        </p>
        <ul className="list-disc list-inside text-muted mb-4 ml-4 leading-relaxed">
          <li>For any unauthorized access, identity theft, fraud, or other illegal activities.</li>
          <li>To harass, abuse, or harm another person.</li>
          <li>To disrupt the service.</li>
          <li>Automated access (e.g., bots, scripts) without explicit permission.</li>
        </ul>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">4. Disclaimers</h2>
        <p className="text-muted mb-4 leading-relaxed">
          The service is provided "as is" without any warranties, express or implied. We do not guarantee the accuracy, completeness, or timeliness of the data. See our full Disclaimer for more details.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">5. Limitation of Liability</h2>
        <p className="text-muted mb-4 leading-relaxed">
          To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, resulting from (a) your access to or use of or inability to access or use the service; (b) any conduct or content of any third party on the service.
        </p>

        <h2 className="text-2xl font-semibold text-header-text mb-4 mt-6">6. Changes to Terms</h2>
        <p className="text-muted mb-4 leading-relaxed">
          We reserve the right to modify these Terms at any time. Your continued use of the service after any such changes constitutes your acceptance of the new Terms.
        </p>


      </div>
    </div>
  );
}