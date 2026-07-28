// auth.go is music-service's resource-server side: validating the USER's token.
//
// It is deliberately near-identical to recommendation-service/auth.go, because
// validating an access token is the same job everywhere: signature via JWKS,
// then iss, aud, exp. The one addition here is that we stash the raw token on
// the context, because music-service needs it later to perform token exchange
// (trading the user's token for a downstream one).
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

type ctxKey string

const (
	claimsKey ctxKey = "claims"
	bearerKey ctxKey = "bearer"
)

type Claims struct {
	Subject         string   `json:"sub"`
	AuthorizedParty string   `json:"azp"`
	Audience        string   `json:"aud"`
	Scope           string   `json:"scope"`
	PreferredUser   string   `json:"preferred_username"`
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
	// NOTE: go-oidc names this the ID-token verifier, but a Keycloak access
	// token is the same signed JWT structure, so verifying it this way
	// (signature + iss + aud + exp) is correct. If your access tokens ever
	// carry aud differently, adjust the audience mapper in the realm export.
	return &Validator{verifier: verifier}, nil
}

func (v *Validator) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, err := bearerToken(r)
		if err != nil {
			http.Error(w, "missing bearer token", http.StatusUnauthorized)
			return
		}

		log.Printf("bearer token (len=%d, first 30): %s...", len(raw), firstN(raw, 30))
		tok, err := v.verifier.Verify(r.Context(), raw)
		if err != nil {
			log.Printf("token verification failed: %v", err)
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}

		var claims Claims
		if err := tok.Claims(&claims); err != nil {
			log.Printf("claims extraction failed: %v", err)
			http.Error(w, "invalid token claims", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, &claims)
		ctx = context.WithValue(ctx, bearerKey, raw) // needed for token exchange
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

// BearerFromContext returns the raw, already-validated user access token.
func BearerFromContext(ctx context.Context) string {
	s, _ := ctx.Value(bearerKey).(string)
	return s
}

func firstN(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
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
