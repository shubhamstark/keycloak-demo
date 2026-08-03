# Custom Keycloak image with the Mock SMS OTP SPI baked in.
# Extends the pinned 26.3 image — copies the JAR into /providers/
# so Keycloak discovers and registers it at startup.
#
# Build: docker build -t keycloak-tajir:26.3 -f keycloak-spi/Dockerfile .
FROM quay.io/keycloak/keycloak:26.3

# Copy the SPI JAR into Keycloak's provider directory.
# Keycloak scans this directory at startup for custom providers.
COPY keycloak-spi/sms-otp-authenticator/target/sms-otp-authenticator.jar /opt/keycloak/providers/

# Keycloak will auto-discover the MockSmsAuthenticatorFactory via the
# ServiceLoader file inside the JAR. No additional configuration needed.
