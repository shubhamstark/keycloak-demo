# Mock SMS OTP — Keycloak SPI Extension

This is the concrete implementation of the SPI (Service Provider Interface)
extension pattern described in `keycloak-mapped.md`, lines 549–558:

> "A custom SMS one-time-password factor is added, since Keycloak has no
> built-in SMS OTP … the answer is usually a provider at one of these
> seams, not a fork."

## What it does

Adds a second authentication factor to the login flow. After entering
username and password, the user sees a **mock SMS code** on screen and
must type it back to prove possession. In production, the code would
arrive via SMS (Twilio, etc.) instead of being displayed.

```
Login flow:  username/password  →  SMS code page  →  tokens issued
                                     ↑
                            MockSmsAuthenticator
```

## Files

```
sms-otp-authenticator/
  pom.xml                           # Maven build (depends on keycloak-server-spi)
  src/main/java/com/tajir/auth/
    MockSmsAuthenticator.java       # The authenticator: generates code, validates input
    MockSmsAuthenticatorFactory.java # Registers the authenticator with Keycloak's SPI
  src/main/resources/
    META-INF/services/
      org.keycloak.authentication.AuthenticatorFactory  # Java ServiceLoader file
    theme-resources/templates/
      sms-otp.ftl                   # Freemarker template: renders the SMS code form
```

## How Keycloak discovers it

1. **At build time**: Maven compiles the Java files into a JAR. The
   `META-INF/services/org.keycloak.authentication.AuthenticatorFactory`
   file inside the JAR lists `com.tajir.auth.MockSmsAuthenticatorFactory`.

2. **At startup**: Keycloak scans `/opt/keycloak/providers/` for JARs.
   It reads the `META-INF/services/` file and instantiates every factory
   listed there.

3. **In the admin console**: "Mock SMS OTP" now appears in the
   authentication flow editor palette, alongside built-in steps like
   "Password Form" and "OTP Form". An admin drags it into any flow.

4. **At runtime**: When the flow reaches this step, Keycloak calls
   `MockSmsAuthenticator.authenticate()` → renders the form → user
   submits → `MockSmsAuthenticator.action()` validates → flow proceeds.

## The two methods that matter

### `authenticate()` — called when the step is reached

```java
// 1. Generate a random 6-digit code
String code = String.format("%06d", RANDOM.nextInt(1_000_000));

// 2. Store it in the authentication session (persists across form submit)
session.setAuthNote("mock_sms_code", code);

// 3. Render the form — shows the code and a text input
context.form()
    .setAttribute("sms_code", code)
    .createForm("sms-otp.ftl");
context.challenge(challenge);
```

### `action()` — called when the user submits the form

```java
// 1. Get the stored code from the session
String expected = session.getAuthNote("mock_sms_code");

// 2. Get the user's input from the POST body
String entered = formData.getFirst("sms_code_input");

// 3. Compare — if match, proceed; if not, re-show form with error
if (expected.equals(entered)) {
    context.success();  // move to next step
} else {
    context.failureChallenge(...);  // retry with error message
}
```

## Production vs mock

| Aspect | Mock (this demo) | Production |
|---|---|---|
| Code delivery | Shown on-screen in a `<div>` | Sent via SMS gateway (Twilio, Vonage, etc.) |
| Phone number | Not stored | Stored as a user attribute, looked up in `authenticate()` |
| Rate limiting | None | Max N attempts per session, exponential backoff |
| Code length | 6 digits | 6–8 digits, configurable |
| Transport | HTML form POST | HTTPS to SMS gateway API |

The production code would add an HTTP call to the SMS gateway inside
`authenticate()`, then validate in `action()` exactly like the mock does.
The session storage pattern (`setAuthNote` / `getAuthNote`) is identical.

## Building and deploying

```bash
# Build the JAR
cd keycloak-spi/sms-otp-authenticator && mvn package -q

# Build custom Keycloak image with the JAR baked in
cd ../.. && docker build -t keycloak-tajir:26.3 -f keycloak-spi/Dockerfile .
minikube image load keycloak-tajir:26.3

# Deploy
kubectl apply -f k8s/20-keycloak.yaml
kubectl -n keycloak-demo delete pod -l app=keycloak --force --grace-period=0
```

## Registering in the authentication flow

After Keycloak starts, add the authenticator to the browser flow via the
Admin REST API:

```bash
TOKEN=$(curl -s -d "grant_type=password&client_id=admin-cli&username=admin&password=admin" \
  -H "Host: keycloak.demo.local" http://127.0.0.1/realms/master/protocol/openid-connect/token \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Get browser flow ID
BROWSER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Host: keycloak.demo.local" \
  "http://127.0.0.1/admin/realms/demo/authentication/flows" \
  | python3 -c "import sys,json; [print(f['id']) for f in json.load(sys.stdin) if f['alias']=='browser']")

# Add mock-sms-otp to the flow
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Host: keycloak.demo.local" \
  "http://127.0.0.1/admin/realms/demo/authentication/flows/$BROWSER_ID/executions/execution" \
  -d '{"provider":"mock-sms-otp"}'

# Set it to REQUIRED (find the execution ID first)
EXEC_ID=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Host: keycloak.demo.local" \
  "http://127.0.0.1/admin/realms/demo/authentication/flows/$BROWSER_ID/executions" \
  | python3 -c "import sys,json; [print(e['id']) for e in json.load(sys.stdin) if e.get('providerId')=='mock-sms-otp']")

curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Host: keycloak.demo.local" \
  "http://127.0.0.1/admin/realms/demo/authentication/flows/$BROWSER_ID/executions" \
  -d "{\"id\":\"$EXEC_ID\",\"requirement\":\"REQUIRED\"}"
```

Now log in through the Tajir app — after password, you'll see the SMS code form.
