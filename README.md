# DetailFlow

> **The operating system for modern automotive detailing businesses.**

DetailFlow is a production SaaS platform built for automotive detailers to manage the complete customer journey — from the first inquiry to quoting, customer communication, and payment.

It gives detailing businesses a dedicated workflow for capturing leads, organizing customers and vehicles, managing services, generating quotes, and collecting payments while keeping each business's data securely isolated.

**Production:** [detailflow-two.vercel.app](https://detailflow-two.vercel.app?utm_source=chatgpt.com)

---

## What is DetailFlow?

Automotive detail businesses often manage customer requests across text messages, social media, spreadsheets, payment links, and disconnected tools.

DetailFlow brings those workflows into one application.

A business can:

1. Configure its business profile.
2. Create its services and pricing.
3. Generate a business-specific customer link.
4. Send that link to potential customers.
5. Receive structured lead submissions.
6. Review customer and vehicle information.
7. Create and send quotes.
8. Allow customers to review their quotes.
9. Collect payments through Stripe.
10. Track the customer throughout the workflow.

The goal is simple:

**Turn a customer inquiry into an organized, actionable business workflow.**

---

# Core Workflow

```text
                    DETAILFLOW
                         │
                         ▼
              Business creates profile
                         │
                         ▼
               Configure services
                         │
                         ▼
              Generate lead link
                         │
                         ▼
          ┌──────────────────────────┐
          │     Customer submits     │
          │      lead request        │
          └────────────┬─────────────┘
                       │
                       ▼
                  Lead created
                       │
                       ▼
              Business reviews lead
                       │
                       ▼
                  Create quote
                       │
                       ▼
               Customer receives
                     quote
                       │
                       ▼
              Customer accepts/pays
                       │
                       ▼
                Payment processed
                       │
                       ▼
                 Customer workflow
                    continues
```

---

# Customer Lead Links

Every business can have its own public lead intake URL.

Example:

```text
https://detailflow-two.vercel.app/{business-slug}/lead
```

The business slug identifies which business owns the submission.

A customer can use the link to provide information such as:

* Contact information
* Vehicle information
* Requested service
* Project details
* Photos when applicable

The resulting lead is associated with the correct business and is not intended to become globally accessible to other businesses.

This tenant isolation is enforced through the application's authorization model and database security policies.

---

# Features

### Lead Management

* Business-specific public lead links
* Structured lead intake
* Customer contact information
* Vehicle information
* Lead status management
* Lead detail views
* Business-specific lead ownership

### Customer Management

* Customer records
* Customer history
* Associated vehicles
* Lead-to-customer workflows
* Business-level data isolation

### Services

Businesses can configure the services they offer, including:

* Service names
* Pricing
* Service descriptions
* Customer-facing service selection

### Quotes

DetailFlow provides a quote workflow for turning leads into customer proposals.

Capabilities include:

* Quote creation
* Service selection
* Pricing
* Quote lifecycle management
* Customer-facing quote pages
* Quote status tracking
* Payment workflow integration

### Payments

DetailFlow integrates with Stripe to support payment workflows.

Depending on the business configuration, Stripe Connect can be used to route customer payments to the appropriate business account.

### AI Assistance

DetailFlow includes AI-assisted functionality for automotive workflows, including vehicle/photo assessment.

AI is treated as an assistance layer rather than an authority.

Business rules, authorization, payment state, and security-sensitive decisions remain deterministic application logic.

### Notifications

Transactional email functionality supports customer and business communication through the applicat
