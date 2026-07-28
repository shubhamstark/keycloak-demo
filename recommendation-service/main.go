// recommendation-service is a pure OAuth resource server.
//
// It performs no login and holds no client secret of its own for the purpose of
// serving requests. Its only job is to accept an access token, validate it, and
// confirm the token was actually minted for it (the audience check). It is the
// downstream service that music-service calls, and it exists to show that a
// resource server trusts nothing it cannot verify.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

// recommendations is the entire "database": hardcoded, in memory, on purpose.
// The demo is about auth, not storage.
var recommendations = map[string][]string{
	// keyed by the user's subject (sub) claim
	"default": {"Kind of Blue - Miles Davis", "Blue Train - John Coltrane", "Moanin' - Art Blakey"},
}

func main() {
	issuer := mustEnv("OIDC_ISSUER")
	// The audience this service demands. A token whose aud is not this value is
	// rejected, even if it is perfectly valid and signed by the same Keycloak.
	audience := mustEnv("OIDC_AUDIENCE") // e.g. "recommendation-service"

	v, err := NewValidator(issuer, audience)
	if err != nil {
		log.Fatalf("failed to build token validator: %v", err)
	}

	mux := http.NewServeMux()

	// GET /recommendations
	// Protected: requires a valid access token whose audience is this service.
	mux.Handle("/recommendations", v.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := ClaimsFromContext(r.Context())

		// Who is this call ultimately for? Two shapes arrive here:
		//   - client credentials: sub is the service account, there is no end user
		//   - token exchange: sub is the original user, forwarded on their behalf
		// We log both so the demo makes the difference visible.
		log.Printf("recommendations requested: sub=%s azp=%s aud=%v",
			claims.Subject, claims.AuthorizedParty, claims.Audience)

		recs, ok := recommendations[claims.Subject]
		if !ok {
			recs = recommendations["default"]
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"servedBy":       "recommendation-service",
			"forSubject":     claims.Subject,
			"recommendations": recs,
		})
	})))

	// GET /healthz is unprotected so Kubernetes can probe it.
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := ":" + getenv("PORT", "8081")
	log.Printf("recommendation-service listening on %s (issuer=%s audience=%s)", addr, issuer, audience)
	log.Fatal(http.ListenAndServe(addr, corsMiddleware(mux)))
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("required environment variable %s is not set", k)
	}
	return v
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// corsMiddleware adds permissive CORS headers so the browser-based SPA can call
// this service cross-origin (app.demo.local → music.demo.local). The preflight
// (OPTIONS) is handled here; the real request passes through with headers added.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
