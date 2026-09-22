# Firebase setup

1. In Firebase Console, create a project with billing enabled for production workloads.
2. Add a Web app and copy its config into `.env.local`. These web values are public configuration, not secrets.
3. In Authentication > Sign-in method, enable Email/Password and add the local, Vercel preview, and production domains under Authorized domains.
4. Create Firestore in production mode. Choose a region close to the business and do not change it later.
5. Create Storage with the same region strategy. Do not make the bucket public.
6. Install the CLI: `npm install -g firebase-tools`, then `firebase login`.
7. From this project, run `firebase use --add` and choose the project.
8. Deploy the checked-in rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes,storage`.
9. Create a development user in Authentication, then create its `users/{uid}` document and a business membership document. Production onboarding should create these through a trusted server action.
10. In App Check, register the production web app with reCAPTCHA Enterprise when the domain is ready. Enforce App Check only after staging traffic is verified.
11. For server-side work, create a dedicated service account with only the permissions required by the Admin SDK. Store the project ID, client email, and escaped private key in Vercel server-only variables.
12. Test rules with the Firebase Emulator Suite and two test identities: a member of Business A must not read or write Business B.

Common errors: `permission-denied` means the user lacks the expected membership document or the rules were not deployed; Storage CORS and authorized-domain issues are separate from Storage rules.
