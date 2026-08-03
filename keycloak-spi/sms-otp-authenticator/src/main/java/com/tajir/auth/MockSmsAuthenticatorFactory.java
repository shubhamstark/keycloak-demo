package com.tajir.auth;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

/**
 * Factory that registers {@link MockSmsAuthenticator} with Keycloak's SPI
 * (Service Provider Interface) machinery.
 *
 * <p>Every custom authenticator needs a factory. Keycloak discovers
 * factories via the Java ServiceLoader mechanism — the file
 * {@code META-INF/services/org.keycloak.authentication.AuthenticatorFactory}
 * lists this class, and Keycloak scans it at startup.</p>
 *
 * <p>Once registered, "Mock SMS OTP" appears in the authentication flow
 * editor alongside Keycloak's built-in steps (Password Form, OTP Form, etc.).
 * An admin can drag it into any flow. This is the article's "a custom
 * authenticator appears in the flow editor exactly like a built-in one."</p>
 *
 * @see MockSmsAuthenticator The authenticator implementation.
 */
public class MockSmsAuthenticatorFactory implements AuthenticatorFactory {

    /**
     * Unique ID for this authenticator. This is the value used in the realm
     * export and Admin API to reference this step. Must not collide with
     * Keycloak's built-in IDs.
     */
    public static final String PROVIDER_ID = "mock-sms-otp";

    /**
     * Display name shown in the Keycloak admin console's flow editor.
     */
    @Override
    public String getDisplayType() {
        return "Mock SMS OTP";
    }

    /**
     * Reference category — groups authenticators in the flow editor palette.
     * "otp" groups it with other OTP-related steps.
     */
    @Override
    public String getReferenceCategory() {
        return "otp";
    }

    /**
     * Help text shown in the admin console flow editor.
     */
    @Override
    public String getHelpText() {
        return "Mock SMS OTP: generates a code and shows it on-screen. "
                + "In production, replace with a real SMS gateway (Twilio, etc.).";
    }

    /**
     * Whether this authenticator has configurable properties. False for the mock.
     */
    @Override
    public boolean isConfigurable() {
        return false;
    }

    /**
     * The authentication execution requirement. What requirement level
     * this step defaults to when first added to a flow.
     * REQUIRED = the user MUST pass this step.
     */
    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return new AuthenticationExecutionModel.Requirement[]{
                AuthenticationExecutionModel.Requirement.REQUIRED,
                AuthenticationExecutionModel.Requirement.ALTERNATIVE,
                AuthenticationExecutionModel.Requirement.DISABLED,
        };
    }

    /**
     * Whether the user must already be identified (username known) before
     * this step. True — SMS OTP comes after password, so we know who
     * the user is. In production, you'd look up their phone number here.
     */
    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    /**
     * Config properties for the admin console. None needed for the mock,
     * but in production you'd add: SMS gateway URL, API key, etc.
     */
    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return List.of();
    }

    /**
     * Creates a NEW instance of the authenticator. Called each time
     * the flow runs. In production, you'd read config from the session
     * or realm here (e.g., SMS gateway credentials).
     */
    @Override
    public Authenticator create(KeycloakSession session) {
        return new MockSmsAuthenticator();
    }

    /**
     * Called at Keycloak startup. Used for one-time initialization.
     * Not needed for this mock.
     */
    @Override
    public void init(Config.Scope config) {
        // No initialization needed.
    }

    /**
     * Called at Keycloak shutdown. Used for cleanup.
     * Not needed for this mock.
     */
    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // No post-init needed.
    }

    /**
     * Called at Keycloak shutdown. Used for cleanup.
     */
    @Override
    public void close() {
        // Nothing to clean up.
    }

    /**
     * The unique provider ID. Must match the PROVIDER_ID constant.
     * Keycloak uses this to look up the authenticator when processing
     * flow configurations.
     */
    @Override
    public String getId() {
        return PROVIDER_ID;
    }
}
