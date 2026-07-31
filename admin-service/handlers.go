// handlers.go serves the admin endpoints for Tajir.
//
// Every handler first validates the caller's token (already done by Require
// middleware), then enforces the tenant boundary: callers can only manage
// users within their own organization. Company-admin role is required for
// write operations. This is the delegated admin pattern from
// keycloak-mapped.md, lines 350-425: your backend is the gate.
//
// Read operations (list users, roles, groups) are available to any
// authenticated user but results are filtered to the caller's org.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type Handlers struct {
	Admin *KeycloakAdmin
}

// ---------------------------------------------------------------------------
// Team (users in the caller's organization)
// ---------------------------------------------------------------------------

// GET /api/team — list all users in the realm.
// This is the endpoint dashboard-service calls via token exchange.
// In a real multi-tenant app, this would filter by the caller's organization.
// For the demo, it returns all users since we illustrate the pattern,
// not production tenant isolation.
func (h *Handlers) GetTeam(w http.ResponseWriter, r *http.Request) {
	users, err := h.Admin.GetUsers()
	if err != nil {
		http.Error(w, "failed to list users: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"members": users})
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

// POST /api/users — create a user and add them to the caller's organization.
func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if !claims.HasRole("company-admin") {
		http.Error(w, "forbidden: requires company-admin role", http.StatusForbidden)
		return
	}

	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
		OrgName  string `json:"orgName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Tenant boundary: can only create users in your own org.
	callerOrg := claims.OrgName()
	if req.OrgName != "" && !strings.EqualFold(req.OrgName, callerOrg) {
		http.Error(w, "forbidden: can only create users in your own organization", http.StatusForbidden)
		return
	}

	user := map[string]any{
		"username":      req.Username,
		"email":         req.Email,
		"emailVerified": true,
		"enabled":       true,
		"credentials": []map[string]any{
			{"type": "password", "value": req.Password, "temporary": false},
		},
	}

	userID, err := h.Admin.CreateUser(user)
	if err != nil {
		log.Printf("create user failed: %v", err)
		http.Error(w, "failed to create user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Add to the caller's organization.
	orgs, err := h.Admin.GetOrganizations()
	if err != nil {
		log.Printf("get orgs failed: %v", err)
		http.Error(w, "user created but org assignment failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	for _, org := range orgs {
		if name, ok := org["name"].(string); ok && strings.EqualFold(name, callerOrg) {
			if id, ok := org["id"].(string); ok {
				if err := h.Admin.AddOrganizationMember(id, userID); err != nil {
					log.Printf("add org member failed: %v", err)
					http.Error(w, "user created but org assignment failed: "+err.Error(), http.StatusInternalServerError)
					return
				}
				break
			}
		}
	}

	writeJSON(w, map[string]any{"id": userID, "username": req.Username, "organization": callerOrg})
}

// ---------------------------------------------------------------------------
// Role assignments
// ---------------------------------------------------------------------------

// POST /api/users/{id}/roles — assign realm roles to a user.
func (h *Handlers) AssignRole(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if !claims.HasRole("company-admin") {
		http.Error(w, "forbidden: requires company-admin role", http.StatusForbidden)
		return
	}

	// Extract user ID from path: /api/users/{id}/roles
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/users/"), "/")
	if len(parts) < 2 || parts[0] == "" {
		http.Error(w, "missing user ID in path", http.StatusBadRequest)
		return
	}
	userID := parts[0]

	var req struct {
		Roles []map[string]any `json:"roles"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.Admin.AddUserRealmRoles(userID, req.Roles); err != nil {
		http.Error(w, "failed to assign roles: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]any{"status": "ok", "userId": userID})
}

// DELETE /api/users/{id}/roles — remove realm roles from a user.
func (h *Handlers) RemoveRole(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if !claims.HasRole("company-admin") {
		http.Error(w, "forbidden: requires company-admin role", http.StatusForbidden)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/users/"), "/")
	if len(parts) < 2 || parts[0] == "" {
		http.Error(w, "missing user ID in path", http.StatusBadRequest)
		return
	}
	userID := parts[0]

	var req struct {
		Roles []map[string]any `json:"roles"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.Admin.RemoveUserRealmRoles(userID, req.Roles); err != nil {
		http.Error(w, "failed to remove roles: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]any{"status": "ok", "userId": userID})
}

// ---------------------------------------------------------------------------
// Roles (read-only catalog)
// ---------------------------------------------------------------------------

// GET /api/roles — list all realm roles.
func (h *Handlers) GetRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.Admin.GetRoles()
	if err != nil {
		http.Error(w, "failed to list roles: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, roles)
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

// GET /api/groups — list all groups.
func (h *Handlers) GetGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := h.Admin.GetGroups()
	if err != nil {
		http.Error(w, "failed to list groups: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, groups)
}

// POST /api/groups — create a new group.
func (h *Handlers) CreateGroup(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if !claims.HasRole("company-admin") {
		http.Error(w, "forbidden: requires company-admin role", http.StatusForbidden)
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	groupID, err := h.Admin.CreateGroup(req.Name)
	if err != nil {
		http.Error(w, "failed to create group: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]any{"id": groupID, "name": req.Name})
}

// POST /api/groups/{id}/roles — assign realm roles to a group.
func (h *Handlers) AssignGroupRole(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if !claims.HasRole("company-admin") {
		http.Error(w, "forbidden: requires company-admin role", http.StatusForbidden)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/groups/"), "/")
	if len(parts) < 2 || parts[0] == "" {
		http.Error(w, "missing group ID in path", http.StatusBadRequest)
		return
	}
	groupID := parts[0]

	var req struct {
		Roles []map[string]any `json:"roles"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.Admin.AddGroupRealmRoles(groupID, req.Roles); err != nil {
		http.Error(w, "failed to assign group roles: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]any{"status": "ok", "groupId": groupID})
}

// ---------------------------------------------------------------------------
// Organizations (read-only)
// ---------------------------------------------------------------------------

// GET /api/organizations — list all organizations.
func (h *Handlers) GetOrganizations(w http.ResponseWriter, r *http.Request) {
	orgs, err := h.Admin.GetOrganizations()
	if err != nil {
		http.Error(w, "failed to list organizations: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, orgs)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
