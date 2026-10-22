# CampusVoice — Engineering Rules

## 1. Must Do
- Keep the MVP limited to two active departments and two department administrators.
- Use Next.js + TypeScript, Appwrite Cloud Auth, Appwrite Database, Appwrite Cloud Functions, and Vercel unless a documented decision changes.
- Keep secrets server-side. Commit only placeholder values in `.env.example`.
- Authenticate requests and authorize each protected operation inside Appwrite Functions.
- Treat every browser-supplied value as untrusted.
- Derive department ownership from a trusted server-side profile.
- Treat enrollment numbers as strings.
- Extract the department code from characters 8–9 (1-based indexing), using the zero-based slice `[7:9]`, and test it against official enrollment examples.
- Enforce one support per student per complaint at the persistence layer or with an equivalent atomic strategy.
- Derive support counts from persisted support records or a reliable transactional aggregate.
- Validate and normalize input inside Appwrite Functions.
- Use pagination and bounded query sizes.
- Use accessible form labels, keyboard navigation, visible focus states, and clear error messages.
- Keep department complaints private to their department.
- Make Public Issues visible across both active departments.
- Log operational errors without logging OAuth tokens, API keys, passwords, or unnecessary personal data.
- Test authorization and data visibility, not only whether pages render.
- Update the relevant docs when a technical decision changes.

## 2. Must Not Do
- Do not change the confirmed department-code position: characters 8–9 (1-based indexing).
- Do not search the entire enrollment number for `06` or `07`; extract only characters 8–9.
- Do not silently assign a department when the code is invalid or ambiguous.
- Do not let students set or edit their own `role`, `department_id`, or admin flag through ordinary APIs.
- In the Raise Complaint form, student name, enrollment number, and department are prefilled from the profile and read-only.
- Never trust those displayed frontend values when creating a complaint; resolve them again from the authenticated user's trusted profile in the Appwrite Function.
- Required complaint fields: title, location, description, and priority (`Low`, `Medium`, or `High`). Attachments are optional and must be validated for allowed file types and size.
- Do not rely on frontend-only route protection.
- Do not trust an email address typed into a form as proof of admin identity.
- Do not expose Appwrite server API keys to the browser.
- Do not make private complaint collections globally readable.
- Do not increment support counts from a client-provided number.
- Do not permit duplicate support records.
- Do not create a second complaint when a student clicks Support.
- Do not fake success when a request fails.
- Do not leave core buttons as inert placeholders.
- Do not add unrequested AI, chat, notifications, uploads, or elaborate analytics before core workflows pass.
- Do not claim that API/database load is eliminated; support actions still require validation and persistence.
- Do not claim production readiness without deployed-flow testing.

## 3. Security Rules
- Use least privilege for Appwrite permissions and server API keys.
- Keep admin authorization data in trusted server-managed records or a protected allowlist.
- Verify authenticated identity using the supported Appwrite server-side mechanism.
- Check complaint visibility and admin scope on every read and mutation.
- Return generic authorization errors when revealing record existence would leak private information.
- Restrict CORS to known frontend origins, while remembering that CORS is not a replacement for authorization.
- Use HTTPS for production.
- Do not store raw passwords; authentication is delegated to Appwrite/Google OAuth.
- Avoid placing sensitive enrollment information in analytics or verbose logs.

## 4. Code Quality Rules
- Use typed request/response schemas.
- Keep route handlers thin; place business logic in services.
- Keep Appwrite access isolated in repository/service modules.
- Use consistent API error shapes.
- Prefer small components and clear names.
- Avoid duplicated authorization logic where a shared dependency/service can enforce it consistently.
- Add tests for every authorization boundary and support uniqueness rule.
- Document any temporary workaround and its removal criteria.

## 5. Deadline Rules
- Prioritize authentication, onboarding state, complaint visibility, support uniqueness, admin status updates, and deployment.
- If the overall enrollment format remains unverified, validate against the confirmed code position and reject malformed numbers or use an approved verification flow; never fabricate a department assignment.
- If a feature cannot be completed, mark it as incomplete; do not simulate its result with hardcoded data.

- During first-time profile setup, warn students that their name and enrollment number cannot be changed through their account after saving.
- Enforce this restriction server-side, not only by disabling frontend inputs. Corrections require an authorized admin/support workflow.
- `Rahul` and `246510307054` are reference examples only, not global defaults.
