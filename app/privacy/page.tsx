import type { Metadata } from "next";
import { LegalPageShell } from "@/components/LegalPageShell";
import { orgSiteUrl } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Privacy Policy — The Vault",
  description:
    "How the Boulder Metalsmithing Association collects, uses, and protects information in The Vault jewelry app.",
};

const LAST_UPDATED = "Last updated: March 27, 2026";

export default function PrivacyPolicyPage() {
  const org = orgSiteUrl();
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        This Privacy Policy describes how the Boulder Metalsmithing Association (&quot;BOMA,&quot; &quot;we,&quot;
        or &quot;us&quot;) handles information when you use <strong>The Vault</strong>—our web
        application for jewelry pricing, inventory, and related tools (the <strong>Service</strong>).
        By using the Service, you agree to this policy. If you do not agree, please do not use the
        Service.
      </p>
      <p>
        The Service is made available in connection with{" "}
        <a href={org} target="_blank" rel="noopener noreferrer">
          BOMA
        </a>
        . This policy applies only to The Vault; BOMA’s main website or other services may have
        separate terms or policies.
      </p>

      <h2>1. What we collect</h2>
      <p>Depending on how you use The Vault, we may process the following types of information:</p>
      <ul>
        <li>
          <strong>Account and authentication.</strong> If you create an account or sign in, we process
          identifiers such as your email address, authentication tokens, and (if you use it) Google
          sign-in data. Our authentication and database infrastructure is provided by{" "}
          <strong>Supabase</strong>.
        </li>
        <li>
          <strong>Business and “Vault” data you provide.</strong> This may include item names, metal
          weights and types, labor and overhead inputs, cost and pricing data, photos or image links,
          tags, time entries, saved formulas, comparison settings, notes, and similar content you
          choose to store.
        </li>
        <li>
          <strong>Subscriptions (Vault+).</strong> If you purchase a paid plan, <strong>Stripe</strong>{" "}
          processes payment information. We typically do not receive your full card number; we may
          receive Stripe customer and subscription identifiers and billing status to provide access.
        </li>
        <li>
          <strong>Security and abuse prevention.</strong> We may use <strong>Cloudflare Turnstile</strong>{" "}
          or similar services to help protect sign-in and forms from automated abuse. Those services
          may process technical signals (such as device or browser data) as described in their
          documentation.
        </li>
        <li>
          <strong>Technical data.</strong> Like most websites, we and our service providers may
          process IP addresses, browser type, device type, general location derived from IP, timestamps,
          and similar logs for security, reliability, and debugging. We may use cookies, local
          storage, or similar technologies needed for sessions and preferences.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <p>We use the information above to:</p>
      <ul>
        <li>Provide, operate, and improve The Vault (including calculator, inventory, and related features)</li>
        <li>Authenticate you and keep your account secure</li>
        <li>Process subscriptions and show whether features are available to you</li>
        <li>Respond to support requests and communicate about the Service when appropriate</li>
        <li>Detect, prevent, and address fraud, abuse, or technical issues</li>
        <li>Comply with law and protect our users and the organization</li>
      </ul>

      <h2>3. Legal bases (EEA/UK users)</h2>
      <p>
        If applicable privacy laws require a “legal basis,” we rely on: (a) performance of a contract
        (providing the Service you request); (b) legitimate interests (e.g. securing the Service,
        improving features, and measuring reliability), balanced against your rights; and (c) where
        required, your consent (for example, where consent is the appropriate basis for a specific
        marketing or non-essential cookie use).
      </p>

      <h2>4. Sharing and service providers</h2>
      <p>We do not sell your personal information. We may share data with:</p>
      <ul>
        <li>
          <strong>Supabase</strong> (hosted database, authentication, and related APIs) under our
          configuration and their terms
        </li>
        <li>
          <strong>Stripe</strong> (payments and subscription status)
        </li>
        <li>
          <strong>Google</strong> (if you use Google sign-in), subject to Google’s terms and your
          Google account settings
        </li>
        <li>
          <strong>Hosting, CDN, and security vendors</strong> (e.g. the platform that runs the app and
          Cloudflare), as needed to deliver the site
        </li>
        <li>
          <strong>Law enforcement or others</strong> when required by law or to protect rights,
          safety, and integrity
        </li>
      </ul>
      <p>
        When we use subprocessors, we choose vendors appropriate for a small association-run app, but
        you should also review their privacy documentation for how they process data on our behalf.
      </p>

      <h2>5. Data retention and deletion</h2>
      <p>
        We keep information only as long as needed for the purposes above. Account-related data
        generally lasts for the life of your account. If you delete your account (where the Service
        provides that) or we terminate access, we will delete or anonymize personal information when
        practicable, subject to legal or security retention needs.
      </p>

      <h2>6. Security</h2>
      <p>
        We use reasonable technical and organizational measures appropriate to the Service (such as
        encryption in transit and access controls). No method of storage or transmission is 100%
        secure; you use The Vault at your own risk to that extent.
      </p>

      <h2>7. Your choices and rights</h2>
      <p>Depending on where you live, you may have the right to:</p>
      <ul>
        <li>Access or receive a copy of your personal information</li>
        <li>Correct inaccurate information</li>
        <li>Request deletion of your information</li>
        <li>Object to or restrict certain processing</li>
        <li>Withdraw consent where processing is consent-based</li>
        <li>Lodge a complaint with a data protection authority</li>
      </ul>
      <p>
        To exercise these rights, contact us through the Boulder Metalsmithing Association’s contact
        options on our website (see link above). We may need to verify your request.
      </p>

      <h2>8. United States; international users</h2>
      <p>
        The Service is operated from the United States. If you access it from other countries, you
        consent to the transfer and processing of your information in the U.S. and other locations
        where our providers operate, which may have different data protection rules than your country.
      </p>

      <h2>9. Children’s privacy</h2>
      <p>
        The Service is not directed to children under 13 (or the age required by your jurisdiction),
        and we do not knowingly collect their personal information. If you believe we have, contact us
        and we will take appropriate steps to delete it.
      </p>

      <h2>10. California residents (summary)</h2>
      <p>
        If the California Consumer Privacy Act (CCPA/CPRA) applies, you may have additional rights
        (e.g. to know, delete, and correct, and to opt out of “sale” or “sharing” of personal
        information as defined in those laws). We do not sell personal information in the traditional
        sense. For rights requests, use the contact path described in Section 7.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The “Last updated” date at the top will
        change, and for material changes we will provide additional notice as appropriate (for example,
        a notice in the app or by email if we have your address). Continued use after changes
        constitutes acceptance of the updated policy.
      </p>

      <h2>12. How to contact us</h2>
      <p>
        For privacy questions about The Vault, contact the Boulder Metalsmithing Association through the
        contact information on our website:{" "}
        <a href={org} target="_blank" rel="noopener noreferrer">
          {org}
        </a>
      </p>
    </LegalPageShell>
  );
}
