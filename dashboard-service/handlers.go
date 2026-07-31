// handlers.go serves the Tajir dashboard business endpoints.
//
// Every protected endpoint validates the bearer token first (via Require
// middleware), then enforces role checks where needed. The data is hardcoded
// in-memory — Tajir is a teaching demo, not a real product. See CLAUDE.md.
package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

// ---------------------------------------------------------------------------
// Business data (hardcoded: teaching demo, not a production database)
// ---------------------------------------------------------------------------

type BankAccount struct {
	Status  string `json:"status"`
	Bank    string `json:"bank"`
	IBAN    string `json:"iban"`
}

type VATFiling struct {
	Period   string `json:"period"`
	Status   string `json:"status"`
	Deadline string `json:"deadline"`
}

func bankAccounts(org string) []BankAccount {
	switch org {
	case "acme":
		return []BankAccount{
			{Status: "active", Bank: "Emirates NBD", IBAN: "AE07 0331 2345 6789 0123 456"},
			{Status: "pending", Bank: "ADCB", IBAN: "AE12 0345 6789 0123 4567 890"},
		}
	case "globex":
		return []BankAccount{
			{Status: "active", Bank: "Mashreq", IBAN: "AE23 0456 7890 1234 5678 901"},
		}
	default:
		return nil
	}
}

func vatFilings(org string) []VATFiling {
	return []VATFiling{
		{Period: "2026-Q1", Status: "filed", Deadline: "2026-04-28"},
		{Period: "2026-Q2", Status: "pending", Deadline: "2026-07-28"},
	}
}

// companyFromEmail derives the organization key from the user's email domain.
// e.g. shubham@acme.com → acme, bob@globex.com → globex.
// This is a demo stand-in for the organization claim (Keycloak 26.3 import
// doesn't support organizations in realm exports).
func companyFromEmail(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return ""
	}
	domain := parts[1]
	switch {
	case strings.Contains(domain, "acme"):
		return "acme"
	case strings.Contains(domain, "globex"):
		return "globex"
	default:
		return ""
	}
}

func companyInfo(org string) map[string]any {
	switch org {
	case "acme":
		return map[string]any{
			"name":    "Acme Corp",
			"domain":  "acme.com",
			"members": 2,
			"plan":    "enterprise",
		}
	case "globex":
		return map[string]any{
			"name":    "Globex Industries",
			"domain":  "globex.com",
			"members": 1,
			"plan":    "business",
		}
	default:
		return map[string]any{
			"name":    "Unknown",
			"domain":  "",
			"members": 0,
			"plan":    "",
		}
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type Handlers struct {
	Downstream DownstreamConfig
}

// orgFromClaims derives the user's company from the email claim.
// Falls back to the organization claim if present.
func orgFromClaims(claims *Claims) string {
	if org := claims.OrgName(); org != "" {
		return org
	}
	return companyFromEmail(claims.Email)
}

// GET /dashboard — company overview (any authenticated user).
func (h *Handlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	org := orgFromClaims(claims)

	resp := map[string]any{
		"company":       companyInfo(org),
		"your_roles":    claims.RealmAccess,
		"organization":  org,
		"authenticated": true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /dashboard/banking — bank account status (requires tax-filer or company-admin).
func (h *Handlers) Banking(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if !claims.HasRole("tax-filer") && !claims.HasRole("company-admin") {
		http.Error(w, "forbidden: requires tax-filer or company-admin role", http.StatusForbidden)
		return
	}

	org := orgFromClaims(claims)
	resp := map[string]any{
		"company":  org,
		"accounts": bankAccounts(org),
		"user":     claims.PreferredUser,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /dashboard/tax — VAT filing status (requires tax-filer or company-admin).
func (h *Handlers) Tax(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if !claims.HasRole("tax-filer") && !claims.HasRole("company-admin") {
		http.Error(w, "forbidden: requires tax-filer or company-admin role", http.StatusForbidden)
		return
	}

	org := orgFromClaims(claims)
	resp := map[string]any{
		"company": org,
		"filings": vatFilings(org),
		"user":    claims.PreferredUser,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /dashboard/team — list team members via admin-service.
//
// The user's access token has aud: ["dashboard-service", "admin-service"],
// so we can forward it directly to admin-service without token exchange.
// admin-service validates it, sees the user's sub + org, and returns users.
//
// Token exchange (RFC 8693) is demonstrated in the API Explorer page description
// of Flow 2 — when a token does NOT have the downstream audience, exchange is
// the mechanism to get one that does.
func (h *Handlers) Team(w http.ResponseWriter, r *http.Request) {
	userToken := BearerFromContext(r.Context())

	body, err := callAdminService(h.Downstream.AdminURL, userToken, "/api/team")
	if err != nil {
		http.Error(w, "admin service call failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}

// GET /healthz — liveness probe.
func (h *Handlers) Healthz(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("ok"))
}
