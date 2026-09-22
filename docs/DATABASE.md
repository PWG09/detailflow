# Database design

All timestamps are PostgreSQL `timestamptz` values. IDs are generated as PostgreSQL UUIDs. Every tenant-owned row includes `business_id`.

## users/{uid}

Required: `uid`, `email`, `role` (`owner|staff`), `businessId`, `createdAt`, `updatedAt`. Optional: `displayName`, `photoURL`, `emailVerified`. A user can read and update only their own profile.

## businesses/{businessId}

Required: `ownerId`, `name`, `slug`, `currency`, `createdAt`, `updatedAt`. Optional: `description`, `logoPath`, `phone`, `email`, `website`, `address`, `serviceArea`, `hours`, `taxRate`, `quoteExpirationDays`, `brand`, `publicSettings`. The slug is unique and must be validated server-side.

## businesses/{businessId}/members/{uid}

Required: `uid`, `role`, `createdAt`. Optional: `invitedAt`, `lastSeenAt`. Membership is the tenant boundary; only owners may mutate membership.

## services/{serviceId}

Required: `businessId`, `name`, `pricingType`, `minimumPrice`, `maximumPrice`, `active`, `displayOrder`, `createdAt`, `updatedAt`. Optional: `description`, `basePrice`, `durationEstimate`, `requiresPhotos`, `category`, `archivedAt`.

## leads/{leadId}

Required: `businessId`, `status`, `customerId`, `vehicle`, `service`, `estimate`, `source`, `createdAt`, `updatedAt`. Optional: `photoPaths`, `aiAssessmentId`, `notes`, `contactedAt`. Status is `new|contacted|quoted|won|lost|archived`.

## customers/{customerId}

Required: `businessId`, `normalizedEmail`, `createdAt`, `updatedAt`. Optional: `firstName`, `lastName`, `phone`, `vehicles`, `notes`. Customer information is never readable from the public quote page.

## quotes/{quoteId}

Required: `businessId`, `quoteNumber`, `customerId`, `vehicle`, `services`, `adjustments`, `subtotal`, `tax`, `total`, `status`, `expiresAt`, `createdAt`, `updatedAt`. Status is `draft|sent|viewed|accepted|declined|expired`.

## aiAssessments/{assessmentId}

Required: `businessId`, `leadId`, `provider`, `result`, `confidence`, `createdAt`. The result is validated structured JSON. AI never writes a final price and is readable only by members.

## Indexes

The initial migration includes indexes for tenant lead timelines, quote status/timeline queries, and service ordering. Add an index through a new SQL migration when an actual query requires it.

## Security

Public quote submission should use a server-side endpoint that validates the business slug, rate-limits the request, uploads files to the business lead path, and creates a lead with an allowlisted field set. Dashboard reads and writes require a member document; owner-only operations are checked by role in rules and again server-side.
