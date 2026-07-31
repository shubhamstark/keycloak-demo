// main.go is the entry point for admin-service.
//
// admin-service is the delegated admin backend for Tajir. It holds a
// service account with Keycloak management roles and proxies admin
// operations while enforcing tenant boundaries. This is the concrete
// implementation of the pattern described in keycloak-mapped.md,
// lines 350-425 ("Multi-tenancy and delegated administration").
//
// Three things happen on every admin request:
//   1. Validate the caller's bearer token (user or token-exchange)
//   2. Enforce the tenant boundary (can only manage own org)
//   3. Call Keycloak's Admin REST API with a service-account token
//
// The service-account token is the client credentials flow from the
// OAuth article, made concrete: admin-service proves it is itself
// and receives a token with management roles. See keycloak.go.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

func main() {
	issuer := os.Getenv("OIDC_ISSUER")
	audience := os.Getenv("OIDC_AUDIENCE")
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}

	keycloakURL := os.Getenv("KEYCLOAK_URL")
	tokenEndpoint := os.Getenv("OIDC_TOKEN_ENDPOINT")
	clientID := os.Getenv("CLIENT_ID")
	clientSecret := os.Getenv("CLIENT_SECRET")
	realm := os.Getenv("KEYCLOAK_REALM")
	if realm == "" {
		realm = "demo"
	}

	if issuer == "" || audience == "" || keycloakURL == "" || clientID == "" || clientSecret == "" {
		log.Fatal("OIDC_ISSUER, OIDC_AUDIENCE, KEYCLOAK_URL, CLIENT_ID, and CLIENT_SECRET must be set")
	}

	validator, err := NewValidator(issuer, audience)
	if err != nil {
		log.Fatalf("failed to create token validator: %v", err)
	}

	admin := NewKeycloakAdmin(keycloakURL, tokenEndpoint, clientID, clientSecret, realm)

	handlers := &Handlers{Admin: admin}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })

	// Team (used by dashboard-service via token exchange).
	mux.Handle("/api/team", validator.Require(http.HandlerFunc(handlers.GetTeam)))

	// Users.
	mux.Handle("/api/users", validator.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			handlers.CreateUser(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// User role assignments: /api/users/{id}/roles
	mux.Handle("/api/users/", validator.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/roles") || strings.Contains(path, "/roles") {
			switch r.Method {
			case http.MethodPost:
				handlers.AssignRole(w, r)
			case http.MethodDelete:
				handlers.RemoveRole(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		http.NotFound(w, r)
	})))

	// Roles (read-only catalog).
	mux.Handle("/api/roles", validator.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.GetRoles(w, r)
	})))

	// Groups.
	mux.Handle("/api/groups", validator.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handlers.GetGroups(w, r)
		case http.MethodPost:
			handlers.CreateGroup(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})))

	// Group role assignments: /api/groups/{id}/roles
	mux.Handle("/api/groups/", validator.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/roles") || strings.Contains(path, "/roles") {
			if r.Method != http.MethodPost {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			handlers.AssignGroupRole(w, r)
			return
		}
		http.NotFound(w, r)
	})))

	// Organizations (read-only list).
	mux.Handle("/api/organizations", validator.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handlers.GetOrganizations(w, r)
	})))

	handler := corsMiddleware(mux)

	log.Printf("admin-service starting on :%s, issuer=%s, audience=%s", port, issuer, audience)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("server exited: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func init() {
	required := []string{"OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_TOKEN_ENDPOINT",
		"KEYCLOAK_URL", "CLIENT_ID", "CLIENT_SECRET"}
	for _, k := range required {
		if os.Getenv(k) == "" {
			log.Printf("WARNING: %s is not set — some features will fail", k)
		}
	}
	fmt.Println("init complete")
}
