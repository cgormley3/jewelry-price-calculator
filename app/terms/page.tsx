import type { Metadata } from "next";
import { LegalPageShell } from "@/components/LegalPageShell";
import { orgSiteUrl } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Terms of Service — The Vault",
  description:
    "Terms governing use of The Vault jewelry pricing and inventory app from the Boulder Metalsmithing Association.",
};

const LAST_UPDATED = "Last updated: March 27, 2026";

export default function TermsOfServicePage() {
  const org = orgSiteUrl();
  return (
    <LegalPageShell title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of <strong>The Vault</strong>
        —the web application operated by the Boulder Metalsmithing Association (&quot;BOMA,&quot;
        &quot;we,&quot; or &quot;us&quot;) for jewelry-related pricing, inventory, and related
        features (the <strong>Service</strong>). By using the Service, you agree to these Terms. If
        you do not agree, do not use the Service.
      </p>
      <p>
        The Service is offered in support of the metalsmithing community. Our general website and
        other programs are separate:{" "}
        <a href={org} target="_blank" rel="noopener noreferrer">
          {org}
        </a>
        .
      </p>

      <h2>1. The Service and eligibility</h2>
      <p>
        The Vault may include, without limitation: metal spot references and price calculators, tools
        to model labor and materials, optional inventory and item records, saved custom formulas, price
        comparisons, time tracking, and (where offered) data export to third-party platforms. Features
        may change, and we may add or remove functionality or subscription tiers.
      </p>
      <p>
        You must be at least 18, or the age of majority where you live, to use the Service, or you
        must have a parent or guardian’s permission if your jurisdiction allows supervised use. The
        Service is not intended for use by children under 13.
      </p>

      <h2>2. Your account</h2>
      <p>
        You are responsible for the accuracy of information you provide and for maintaining the
        security of your sign-in method (for example, access to your email for magic links or your
        Google account for Google sign-in). You must not misuse the Service, attempt to access data
        that is not yours, or interfere with the normal operation, security, or performance of the
        site.
      </p>
      <p>
        We may suspend or terminate access if we reasonably believe you have violated these Terms, pose
        a security risk, or if we are required to do so by law.
      </p>

      <h2>3. Subscriptions, Vault+, and payments</h2>
      <p>
        Some features (such as extended formula or vault capabilities) may be offered on a paid basis
        as <strong>Vault+</strong> or a similarly named plan. When you purchase a paid plan, you
        authorize <strong>Stripe</strong> (or another processor we use) to charge your selected
        payment method according to the product description, pricing, and billing cycle shown at
        checkout. Subscriptions may renew until canceled in accordance with the flow presented at
        purchase and in Stripe’s customer tools where applicable. Taxes and fees may apply as shown at
        checkout.
      </p>
      <p>
        <strong>Refunds and billing disputes</strong> are handled according to the terms presented at
        purchase, Stripe’s policies where applicable, and U.S. law. If you have a question about a
        charge, use the support path described in Section 9 or contact the association.
      </p>
      <p>
        <strong>Price changes</strong> for future renewal periods may occur; we will provide notice
        in a reasonable manner (e.g. email to your account, or a notice in the app) when required.
      </p>

      <h2>4. Your data; license to operate the Service</h2>
      <p>
        You retain rights to the business and creative information you enter. So that we can provide
        The Vault, you grant BOMA a non-exclusive, worldwide, royalty-free license to host, process,
        back up, transmit, and display your content <strong>solely to operate, secure, and improve
        the Service</strong> for you, consistent with our Privacy Policy. We do not claim ownership
        of your designs, formulas, or business records.
      </p>
      <p>
        You are responsible for your own backups and business recordkeeping where required (for
        example, for taxes or consignment). The Service is a convenience tool, not a guaranteed
        archive.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        The Service may let you connect to or export data to third-party platforms (for example, e-commerce
        or shopping tools) through optional integrations. Those services have their own terms and
        privacy policies, and you use them at your own risk. BOMA is not responsible for how third
        parties process your data.
      </p>

      <h2>6. No professional advice; accuracy</h2>
      <p>
        The Service provides <strong>estimates and tools</strong> to support jewelry businesses. It
        is not financial, tax, legal, or investment advice. Market prices, metal spots, and results
        may be incomplete, delayed, or wrong for your situation. <strong>You are solely responsible
        for how you set prices, report income, and comply with laws in your jurisdiction.</strong>
      </p>
      <p>
        We aim for reliability but <strong>do not guarantee</strong> uninterrupted, error-free, or
        loss-free use. To the maximum extent allowed by law, the Service is provided &quot;as
        is&quot; and &quot;as available,&quot; without warranties of any kind, whether express,
        implied, or statutory, including any implied warranty of merchantability, fitness for a
        particular purpose, or non-infringement, except to the extent such disclaimers are prohibited
        by law in your location.
      </p>

      <h2>7. Limitation of liability; indemnity</h2>
      <p>
        <strong>To the maximum extent permitted by law,</strong> BOMA and its volunteers, staff,
        contractors, and directors will not be liable for any indirect, incidental, special,
        consequential, or punitive damages, or for lost profits, lost data, or business
        interruption, arising from or related to your use of the Service, even if we have been
        advised of the possibility. Our aggregate liability for any claim arising from the Service is
        limited to the greater of (a) the amount you paid us for the Service in the three (3) months
        before the event giving rise to the claim, or (b) twenty-five U.S. dollars (US $25) if you have
        not paid us.
      </p>
      <p>
        Some jurisdictions do not allow certain limitations; in those cases, our liability is limited
        to the maximum extent allowed by law.
      </p>
      <p>
        You agree to defend, indemnify, and hold harmless BOMA and its participants from and against
        third-party claims, damages, and expenses (including reasonable attorneys’ fees) arising from
        your use of the Service, your data or content, or your violation of these Terms, to the
        extent permitted by law.
      </p>

      <h2>8. Open-source, feedback, and suggestions</h2>
      <p>
        If the Service references open-source or community components, each component is subject to
        its own license. If you send us feedback, you grant us a perpetual, non-exclusive, worldwide,
        royalty-free right to use that feedback to improve the Service, without payment or obligation
        to you, except that we will not publicize your confidential business data without permission.
      </p>

      <h2>9. Governing law; disputes</h2>
      <p>
        These Terms are governed by the laws of the <strong>State of Colorado, USA</strong>,
        without regard to conflict-of-law rules. The exclusive venue for any dispute (except for claims
        that may be heard in small claims court if eligible) is the state or federal courts located
        in <strong>Boulder County, Colorado</strong>, and you consent to personal jurisdiction
        there. You and BOMA each waive the right to a jury trial to the extent allowed by law.
        <em>If you are a consumer in a region that provides mandatory local protections, those
        mandatory rules still apply to you to the minimum extent required by law.</em>
      </p>

      <h2>10. Changes; termination</h2>
      <p>
        We may change these Terms from time to time. We will post the updated date at the top. For
        material changes, we will provide additional notice as appropriate. Continued use after the
        effective date constitutes acceptance. You may stop using the Service at any time. We may
        modify or end the Service with reasonable notice when practicable.
      </p>

      <h2>11. Contact</h2>
      <p>
        For questions about The Vault, contact the Boulder Metalsmithing Association through the
        information on:{" "}
        <a href={org} target="_blank" rel="noopener noreferrer">
          {org}
        </a>
        .
      </p>

      <h2>12. Entire agreement; severability</h2>
      <p>
        These Terms, together with our Privacy Policy, are the full agreement between you and BOMA
        regarding the Service. If a provision is found invalid, the remainder remain in effect.
      </p>
    </LegalPageShell>
  );
}
