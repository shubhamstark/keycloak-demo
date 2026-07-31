// auth.go validates bearer tokens on every request to admin-service.
//
// Same pattern as dashboard-service/auth.go and the old recommendation-service/auth.go.
// Every request must carry a valid bearer token — either the user's own access
// token (direct from the React app) or a token-exchange token (from
// dashboard-service acting on behalf of the user). Both are validated the
// same way: signature via JWKS, then iss, aud, exp.
//
// The delegated admin pattern from keycloak-mapped.md lives here:
// we validate the caller's identity first, then use a separate
// service-account token to call Keycloak's Admin REST API.
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
)

// Claims is the subset of the token this service cares about.
type Claims struct {
	Subject         string `json:"sub"`
	AuthorizedParty string `json:"azp"`
	Audience        any    `json:"aud"`
	Scope           string `json:"scope"`
	PreferredUser   string `json:"preferred_username"`
	Email           string `json:"email"`
	RealmAccess     struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
	Organization map[string]struct {
		ID string `json:"id"`
	} `json:"organization"`
}

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

func (c *Claims) HasRole(role string) bool {
	for _, r := range c.RealmAccess.Roles {
		if r == role {
			return true
		}
	}
	return false
}

func (c *Claims) OrgName() string {
	for name := range c.Organization {
		return name
	}
	return ""
}
