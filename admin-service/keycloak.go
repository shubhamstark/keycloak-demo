// keycloak.go is the Keycloak Admin REST API client.
//
// It demonstrates the client credentials flow from the article:
// admin-service gets its own service-account token (machine-to-machine,
// no user identity) and uses it to call Keycloak's Admin REST API.
// This is the concrete version of the article's service-account token
// example at keycloak-mapped.md, lines 391-412.
//
// The boundary enforced here is deliberate: admin-service can touch every
// user in the realm via its service account, so the handlers layer MUST
// enforce tenant/organization boundaries before calling these methods.
// See the article's "The critical design point is where the boundary is
// enforced" (lines 367-374).
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type KeycloakAdmin struct {
	baseURL      string
	tokenURL     string
	clientID     string
	clientSecret string
	realm        string

	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
}

func NewKeycloakAdmin(baseURL, tokenURL, clientID, clientSecret, realm string) *KeycloakAdmin {
	return &KeycloakAdmin{
		baseURL:      strings.TrimRight(baseURL, "/"),
		tokenURL:     tokenURL,
		clientID:     clientID,
		clientSecret: clientSecret,
		realm:        realm,
	}
}

// getToken returns a valid service-account token, refreshing if needed.
// This is the client_credentials grant from the OAuth article, made concrete:
// admin-service proves it is itself (client_id + client_secret) and receives
// a token with sub=service-account-admin-service and the management roles
// assigned in realm-export.json.
func (k *KeycloakAdmin) getToken() (string, error) {
	k.mu.Lock()
	defer k.mu.Unlock()

	if k.accessToken != "" && time.Now().Before(k.expiresAt.Add(-30*time.Second)) {
		return k.accessToken, nil
	}

	form := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {k.clientID},
		"client_secret": {k.clientSecret},
	}

	req, err := http.NewRequest("POST", k.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("building token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decoding token response: %w", err)
	}

	k.accessToken = result.AccessToken
	k.expiresAt = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	return k.accessToken, nil
}

// do sends an authenticated request to the Keycloak Admin REST API.
func (k *KeycloakAdmin) do(method, path string, body io.Reader) (*http.Response, error) {
	token, err := k.getToken()
	if err != nil {
		return nil, fmt.Errorf("getting admin token: %w", err)
	}

	url := fmt.Sprintf("%s/admin/realms/%s%s", k.baseURL, k.realm, path)
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return http.DefaultClient.Do(req)
}

// GetUsers returns all users in the realm.
func (k *KeycloakAdmin) GetUsers() ([]map[string]any, error) {
	resp, err := k.do("GET", "/users", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("get users returned %d: %s", resp.StatusCode, string(body))
	}

	var users []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
		return nil, fmt.Errorf("decoding users: %w", err)
	}
	return users, nil
}

// CreateUser creates a new user in the realm.
func (k *KeycloakAdmin) CreateUser(user map[string]any) (string, error) {
	body, _ := json.Marshal(user)
	resp, err := k.do("POST", "/users", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("create user returned %d: %s", resp.StatusCode, string(respBody))
	}

	// Extract user ID from Location header.
	location := resp.Header.Get("Location")
	parts := strings.Split(location, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1], nil
	}
	return "", fmt.Errorf("no user ID in response")
}

// GetRoles returns all realm roles.
func (k *KeycloakAdmin) GetRoles() ([]map[string]any, error) {
	resp, err := k.do("GET", "/roles", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("get roles returned %d: %s", resp.StatusCode, string(body))
	}

	var roles []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&roles); err != nil {
		return nil, fmt.Errorf("decoding roles: %w", err)
	}
	return roles, nil
}

// AddUserRealmRoles assigns realm roles to a user.
func (k *KeycloakAdmin) AddUserRealmRoles(userID string, roles []map[string]any) error {
	body, _ := json.Marshal(roles)
	resp, err := k.do("POST", fmt.Sprintf("/users/%s/role-mappings/realm", userID), strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("add roles returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// RemoveUserRealmRoles removes realm roles from a user.
func (k *KeycloakAdmin) RemoveUserRealmRoles(userID string, roles []map[string]any) error {
	body, _ := json.Marshal(roles)
	resp, err := k.do("DELETE", fmt.Sprintf("/users/%s/role-mappings/realm", userID), strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("remove roles returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// GetGroups returns all groups in the realm.
func (k *KeycloakAdmin) GetGroups() ([]map[string]any, error) {
	resp, err := k.do("GET", "/groups", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("get groups returned %d: %s", resp.StatusCode, string(body))
	}

	var groups []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&groups); err != nil {
		return nil, fmt.Errorf("decoding groups: %w", err)
	}
	return groups, nil
}

// CreateGroup creates a new group in the realm.
func (k *KeycloakAdmin) CreateGroup(name string) (string, error) {
	body, _ := json.Marshal(map[string]string{"name": name})
	resp, err := k.do("POST", "/groups", strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("create group returned %d: %s", resp.StatusCode, string(respBody))
	}

	location := resp.Header.Get("Location")
	parts := strings.Split(location, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1], nil
	}
	return "", fmt.Errorf("no group ID in response")
}

// AddGroupRealmRoles assigns realm roles to a group.
func (k *KeycloakAdmin) AddGroupRealmRoles(groupID string, roles []map[string]any) error {
	body, _ := json.Marshal(roles)
	resp, err := k.do("POST", fmt.Sprintf("/groups/%s/role-mappings/realm", groupID), strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("add group roles returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// GetOrganizations returns all organizations in the realm.
func (k *KeycloakAdmin) GetOrganizations() ([]map[string]any, error) {
	resp, err := k.do("GET", "/organizations", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("get organizations returned %d: %s", resp.StatusCode, string(body))
	}

	var orgs []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&orgs); err != nil {
		return nil, fmt.Errorf("decoding organizations: %w", err)
	}
	return orgs, nil
}

// GetOrganizationMembers returns members of an organization.
func (k *KeycloakAdmin) GetOrganizationMembers(orgID string) ([]map[string]any, error) {
	resp, err := k.do("GET", fmt.Sprintf("/organizations/%s/members", orgID), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("get org members returned %d: %s", resp.StatusCode, string(body))
	}

	var members []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&members); err != nil {
		return nil, fmt.Errorf("decoding org members: %w", err)
	}
	return members, nil
}

// AddOrganizationMember adds a user to an organization.
func (k *KeycloakAdmin) AddOrganizationMember(orgID, userID string) error {
	resp, err := k.do("POST", fmt.Sprintf("/organizations/%s/members", orgID),
		strings.NewReader(fmt.Sprintf(`{"userId":"%s"}`, userID)))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 && resp.StatusCode != 201 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("add org member returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// RemoveOrganizationMember removes a user from an organization.
func (k *KeycloakAdmin) RemoveOrganizationMember(orgID, userID string) error {
	resp, err := k.do("DELETE", fmt.Sprintf("/organizations/%s/members/%s", orgID, userID), nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("remove org member returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}
