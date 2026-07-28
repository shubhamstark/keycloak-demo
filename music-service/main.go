// music-service plays two roles at once, which is the whole point of it.
//
//  1. It is a resource server. It accepts the user's access token (obtained by
//     login-web via authorization code + PKCE), validates it, and returns that
//     user's favourite songs.
//
//  2. It is itself a client. To enrich the response it calls the downstream
//     recommendation-service, and it must authenticate to do so. There is no
//     user "logged in" to that downstream call in the client-credentials case,
//     so it cannot just forward nothing. It uses one of two patterns:
//       - client credentials: music-service acts as itself
//       - token exchange: music-service acts on behalf of the user
//
// The endpoint /favourites?with=recs&mode=client_credentials|token_exchange lets
// you trigger either downstream pattern and watch the difference.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

var favourites = map[string][]string{
	"default": {"Giant Steps", "So What", "Take Five"},
}

func main() {
	issuer := mustEnv("OIDC_ISSUER")
	audience := mustEnv("OIDC_AUDIENCE") // "music-service": tokens must target us

	v, err := NewValidator(issuer, audience)
	if err != nil {
		log.Fatalf("failed to build token validator: %v", err)
	}

	downstream := NewDownstream(DownstreamConfig{
		Issuer:            issuer,
		TokenEndpoint:     mustEnv("OIDC_TOKEN_ENDPOINT"),
		ClientID:          mustEnv("CLIENT_ID"),          // "music-service"
		ClientSecret:      mustEnv("CLIENT_SECRET"),      // demo secret
		RecommendationURL: mustEnv("RECOMMENDATION_URL"), // downstream base URL
		RecommendationAud: mustEnv("RECOMMENDATION_AUDIENCE"),
	})

	mux := http.NewServeMux()

	mux.Handle("/favourites", v.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := ClaimsFromContext(r.Context())
		userToken := BearerFromContext(r.Context()) // the raw token we validated

		resp := map[string]any{
			"servedBy":   "music-service",
			"forUser":    claims.PreferredUser,
			"subject":    claims.Subject,
			"favourites": favouritesFor(claims.Subject),
		}

		// Optionally enrich with downstream recommendations, demonstrating one of
		// the two service-to-service auth patterns.
		if r.URL.Query().Get("with") == "recs" {
			mode := r.URL.Query().Get("mode")
			recs, used, err := downstream.Recommendations(r.Context(), mode, userToken, claims.Subject)
			if err != nil {
				log.Printf("downstream call failed (mode=%s): %v", mode, err)
				resp["recommendationsError"] = err.Error()
			} else {
				resp["recommendations"] = recs
				resp["downstreamAuth"] = used // which pattern was used
			}
		}

		writeJSON(w, http.StatusOK, resp)
	})))

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	addr := ":" + getenv("PORT", "8080")
	log.Printf("music-service listening on %s (issuer=%s audience=%s)", addr, issuer, audience)
	log.Fatal(http.ListenAndServe(addr, corsMiddleware(mux)))
}

func favouritesFor(sub string) []string {
	if f, ok := favourites[sub]; ok {
		return f
	}
	return favourites["default"]
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
