DetailFlow

A modern SaaS platform for automotive detailers to capture leads, manage customers, create quotes, and collect payments.

Production: https://detailflow-two.vercel.app

Overview

DetailFlow gives automotive detail businesses a simple workflow for turning customer inquiries into organized leads and quotes.

Customers can use a business-specific link such as:

https://detailflow-two.vercel.app/{business-slug}/lead

That link is tied to the selected business. Submissions are stored only under that business, while the business owner manages the resulting leads from the DetailFlow dashboard.

Core workflow

Business owner

Configure the business.

Add services and pricing.

Copy the business lead link.

Send the link to customers.

Review incoming leads.

Create and send quotes.

Collect payments through Stripe.

Customer

Open the business's lead link.

Enter contact and vehicle information.

Select a service.

Add photos when required.

Submit the request.

Features

Business-specific customer lead links

Lead and customer management

Service management

Quote creation and lifecycle management

Customer-facing quote pages

Stripe billing and payment infrastructure

Stripe Connect support for business payment accounts

AI-assisted vehicle/photo assessment

Private vehicle photo storage

Supabase Authentication

PostgreSQL + Row Level Security

Transactional email notifications

Responsive dashboard and customer flows

Multi-business data isolation

Tech Stack

Layer

Technology

Frontend

Next.js, React, TypeScript

UI

Tailwind CSS

Backend

Next.js App Router / Route Handlers

Database

Supabase PostgreSQL

Authentication

Supabase Auth

Storage

Supabase Storage

Payments

Stripe + Stripe Connect

AI

NVIDIA NIM / Nemotron

Email

Resend

Hosting

Vercel

Validation

Zod

Testing

Vitest

Project Structure

app/                 Next.js routes, pages, and API endpoints
components/          Reusable UI components
lib/                 Application services and business logic
supabase/
  migrations/        Database schema, RLS, and security migrations
public/              Static assets
types/               Shared TypeScript types
docs/                Small set of project-specific documentation

Local Development

Requirements

Node.js 20+

npm

Supabase project

Stripe account for billing/payment features

NVIDIA API access for AI features

Resend account for transactional email

Install

npm install

Create a local environment file:

cp .env.example .env.local

On Windows PowerShell:

Copy-Item .env.example .env.local

Add the required environment variables, then start the development server:

npm run dev

Open:

http://localhost:3000

Environment Variables

Secrets must remain server-side. Never commit .env.local or production credentials.

The project uses environment variables for:

Supabase

Stripe

Stripe Connect

NVIDIA

Resend

Application URL

Optional monitoring/security integrations

Use .env.example as the source of truth for variable names.

Database

DetailFlow uses Supabase PostgreSQL with Row Level Security.

Database changes are versioned in:

supabase/migrations/

Business-owned records are isolated by business_id. Authorization is enforced server-side and through database policies.

Apply migrations through the normal Supabase migration workflow before using a new deployment.

Payments

DetailFlow uses Stripe for subscriptions and customer payments.

Stripe Connect is used when a business needs to receive payments from its own customers through DetailFlow.

The application never stores customer card details.

Stripe secrets must only exist in server-side environment variables.

AI

AI functionality is provided through NVIDIA's API.

AI is used as an assistant and assessment layer; it does not replace the application's deterministic business logic or authorization.

AI credentials are server-only.

Deployment

The production application is deployed with Vercel.

Typical deployment flow:

GitHub
   ↓
Vercel
   ↓
Next.js
   ↓
Supabase / Stripe / NVIDIA / Resend

Production environment variables must be configured in Vercel before enabling the corresponding integrations.

Quality

Useful local commands:

npm run typecheck
npm test
npm run build

If the repository contains additional scripts, use the scripts defined in package.json as the authoritative commands.

Security

DetailFlow is designed around:

Server-side authorization

Business-level tenant isolation

Supabase Row Level Security

Private customer/vehicle data

Server-only API credentials

Input validation

Rate limiting on sensitive public operations

Stripe webhook verification

Secure public lead/quote flows

Security-sensitive implementation details belong in the project's internal documentation, not in the public README.

License

Private / proprietary software.

Copyright © DetailFlow.
