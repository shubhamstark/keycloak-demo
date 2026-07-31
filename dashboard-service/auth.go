// auth.go validates bearer tokens on every request to dashboard-service.
//
// Same pattern as every resource server in this repo: verify the signature
// against Keycloak's JWKS, then check iss, aud, and exp. No path trusts a
// token without validating it. See keycloak-mapped.md, "Signing keys and
// JWKS, made concrete."
package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

type ctxKey string

const (
	claimsKey ctxKey = "claims"
	bearerKey ctxKey = "bearer"
)

// Claims is the subset of the token this service cares about.
type Claims struct {
	Subject         string `json:"sub"`
	AuthorizedParty string `json:"azp"`
	Audience        any    `json:"aud"` // string or []string
	Scope           string `json:"scope"`
	PreferredUser   string `json:"preferred_username"`
	Email           string `json:"email"`
	GivenName       string `json:"given_name"`
	FamilyName      string `json:"family_name"`
	RealmAccess     struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
	ResourceAccess map[string]struct {
		Roles []string `json:"roles"`
	} `json:"resource_access"`
	Organization map[string]struct {
		ID string `json:"id"`
	} `json:"organization"`
}

// Validator wraps go-oidc. The underlying verifier fetches and caches
// Keycloak's JWKS and refreshes it on key rotation, so validation is
// local and fast: no call to Keycloak per request.
type Validator struct {
	verifier *oidc.IDTokenVerifier
}

func NewValidator(issuer, audience string) (*Validator, error) {
	provider, err := oidc.NewProvider(context.Background(), issuer)
	if err != nil {
		return nil, fmt.Errorf("discovering issuer %q: %w", issuer, err)
	}
	verifier := provider.Verifier(&oidc.Config{ClientID: audience})
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

		tok, err := v.verifier.Verify(r.Context(), raw)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		var claims Claims
		if err := tok.Claims(&claims); err != nil {
			http.Error(w, "invalid token claims", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, &claims)
		ctx = context.WithValue(ctx, bearerKey, raw)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func ClaimsFromContext(ctx context.Context) *Claims {
	c, _ := ctx.Value(claimsKey).(*Claims)
	if c == nil {
		return &Claims{}
	}
	return c
}

func BearerFromContext(ctx context.Context) string {
	s, _ := ctx.Value(bearerKey).(string)
	return s
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

// HasRole checks whether the claims contain a specific realm role.
func (c *Claims) HasRole(role string) bool {
	for _, r := range c.RealmAccess.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// OrgName returns the first organization name from the token, or empty string.
func (c *Claims) OrgName() string {
	for name := range c.Organization {
		return name
	}
	return ""
}
