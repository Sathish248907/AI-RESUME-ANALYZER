"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useAuth as useAuthHook, AuthUser, login, register, logout } from "@/services/authService";

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  isAuthenticated: boolean;
  login: typeof login;
  register: typeof register;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthHook();

  const value: AuthContextValue = {
    user: auth.user,
    ready: auth.ready,
    isAuthenticated: auth.isAuthenticated,
    login,
    register,
    logout: auth.logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
