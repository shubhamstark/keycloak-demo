// auth.go holds the entire token-validation story for this service.
//
// This is the concrete version of the OIDC article's section 5 ("decoding is not
// trusting"). We never read claims out of a token we have not verified. The
// steps, in order, are:
//   1. verify the signature against Keycloak's published public keys (JWKS)
//   2. confirm the issuer is our Keycloak realm
//   3. confirm the audience includes this service
//   4. confirm the token has not expired
// Only then do we trust the claims.
package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

type ctxKey string

const claimsKey ctxKey = "claims"

// Claims is the subset of the token we care about. Keycloak puts more in there;
// we only read what this service needs.
type Claims struct {
	Subject         string   `json:"sub"`
	AuthorizedParty string   `json:"azp"`
	Audience        string   `json:"aud"`
	Scope           string   `json:"scope"`
	PreferredUser   string   `json:"preferred_username"`
}

// Validator wraps go-oidc. The key move is that the underlying verifier fetches
// and caches Keycloak's JWKS and refreshes it on rotation, so validation is
// local and fast: no call to Keycloak per request.
type Validator struct {
	verifier *oidc.IDTokenVerifier
}

// NewValidator builds a verifier bound to one issuer and one required audience.
func NewValidator(issuer, audience string) (*Validator, error) {
	// oidc.NewProvider hits the discovery document
	// (/.well-known/openid-configuration) once to learn the jwks_uri and issuer.
	provider, err := oidc.NewProvider(context.Background(), issuer)
	if err != nil {
		return nil, fmt.Errorf("discovering issuer %q: %w", issuer, err)
	}

	// SkipClientIDCheck=false with ClientID set means: the token's aud MUST
	// contain `audience`. This single line is what defeats the confused deputy
	// for a resource server: a token minted for another service is rejected.
	verifier := provider.Verifier(&oidc.Config{
		ClientID: audience,
		// These access tokens are validated the same way as ID tokens:
		// signature + iss + aud + exp. go-oidc handles exp and iss; we set aud.
	})

	return &Validator{verifier: verifier}, nil
}

// Require is middleware that rejects any request without a valid bearer token.
func (v *Validator) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, err := bearerToken(r)
		if err != nil {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}

		// The one line that does all four checks (sig, iss, aud, exp).
		tok, err := v.verifier.Verify(r.Context(), raw)
		if err != nil {
			// Do not leak why. A failed check is a 401, full stop.
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		var claims Claims
		if err := tok.Claims(&claims); err != nil {
			http.Error(w, "invalid token claims", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, &claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ClaimsFromContext returns the validated claims placed by Require.
func ClaimsFromContext(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsKey).(*Claims)
	if c == nil {
		return &Claims{}
	}
	return c
}

func bearerToken(r *http.Request) (string, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return "", fmt.Errorf("no Authorization header")
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", fmt.Errorf("malformed Authorization header")
	}
	return strings.TrimSpace(parts[1]), nil
}
