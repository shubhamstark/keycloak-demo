// main.go is the entry point for dashboard-service.
//
// dashboard-service is a resource server in the Tajir demo. It validates
// bearer tokens on every request and serves business data (bank accounts,
// VAT filings, team) scoped to the user's organization.
//
// It also demonstrates token exchange (RFC 8693): when the /dashboard/team
// endpoint needs data from admin-service, it exchanges the user's token
// for one targeting admin-service, preserving the user's identity downstream.
// See keycloak-mapped.md and docs/AUTH-FLOWS.md.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	issuer := os.Getenv("OIDC_ISSUER")
	audience := os.Getenv("OIDC_AUDIENCE")
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	if issuer == "" || audience == "" {
		log.Fatal("OIDC_ISSUER and OIDC_AUDIENCE must be set")
	}

	validator, err := NewValidator(issuer, audience)
	if err != nil {
		log.Fatalf("failed to create token validator: %v", err)
	}

	handlers := &Handlers{
		Downstream: DownstreamConfigFromEnv(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", handlers.Healthz)
	mux.Handle("/dashboard", validator.Require(http.HandlerFunc(handlers.Dashboard)))
	mux.Handle("/dashboard/banking", validator.Require(http.HandlerFunc(handlers.Banking)))
	mux.Handle("/dashboard/tax", validator.Require(http.HandlerFunc(handlers.Tax)))
	mux.Handle("/dashboard/team", validator.Require(http.HandlerFunc(handlers.Team)))

	// Permissive CORS so the React app can call from any origin during development.
	handler := corsMiddleware(mux)

	log.Printf("dashboard-service starting on :%s, issuer=%s, audience=%s", port, issuer, audience)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("server exited: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func init() {
	// Sanity check at startup.
	required := []string{"OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_TOKEN_ENDPOINT",
		"CLIENT_ID", "CLIENT_SECRET", "ADMIN_SERVICE_URL", "ADMIN_AUDIENCE"}
	for _, k := range required {
		if os.Getenv(k) == "" {
			log.Printf("WARNING: %s is not set — some features will fail", k)
		}
	}
	fmt.Println("init complete")
}
