export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      edges: {
        Row: {
          created_at: string
          id: string
          kind: string
          repo_id: string
          source_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          repo_id: string
          source_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          repo_id?: string
          source_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_runs: {
        Row: {
          affected: Json
          change_kind: string | null
          created_at: string
          duration_ms: number | null
          id: string
          prompt: string
          repo_id: string
          resolved_symbol_id: string | null
          summary: Json
        }
        Insert: {
          affected?: Json
          change_kind?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          prompt: string
          repo_id: string
          resolved_symbol_id?: string | null
          summary?: Json
        }
        Update: {
          affected?: Json
          change_kind?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          prompt?: string
          repo_id?: string
          resolved_symbol_id?: string | null
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "impact_runs_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_runs_resolved_symbol_id_fkey"
            columns: ["resolved_symbol_id"]
            isOneToOne: false
            referencedRelation: "symbols"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          github_username: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          github_username?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          github_username?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      repos: {
        Row: {
          commit_sha: string | null
          created_at: string
          default_branch: string
          edge_count: number
          file_count: number
          id: string
          indexed_at: string | null
          name: string
          owner: string
          owner_id: string
          status: string
          status_message: string | null
          symbol_count: number
          updated_at: string
          url: string
          visibility: string
        }
        Insert: {
          commit_sha?: string | null
          created_at?: string
          default_branch?: string
          edge_count?: number
          file_count?: number
          id?: string
          indexed_at?: string | null
          name: string
          owner: string
          owner_id: string
          status?: string
          status_message?: string | null
          symbol_count?: number
          updated_at?: string
          url: string
          visibility?: string
        }
        Update: {
          commit_sha?: string | null
          created_at?: string
          default_branch?: string
          edge_count?: number
          file_count?: number
          id?: string
          indexed_at?: string | null
          name?: string
          owner?: string
          owner_id?: string
          status?: string
          status_message?: string | null
          symbol_count?: number
          updated_at?: string
          url?: string
          visibility?: string
        }
        Relationships: []
      }
      symbols: {
        Row: {
          churn: number
          created_at: string
          docstring: string | null
          fan_in: number
          fan_out: number
          file_path: string
          id: string
          kind: string
          line_number: number
          name: string
          qualified_name: string
          repo_id: string
        }
        Insert: {
          churn?: number
          created_at?: string
          docstring?: string | null
          fan_in?: number
          fan_out?: number
          file_path: string
          id?: string
          kind: string
          line_number?: number
          name: string
          qualified_name: string
          repo_id: string
        }
        Update: {
          churn?: number
          created_at?: string
          docstring?: string | null
          fan_in?: number
          fan_out?: number
          file_path?: string
          id?: string
          kind?: string
          line_number?: number
          name?: string
          qualified_name?: string
          repo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "symbols_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "repos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_fan_counts: { Args: { p_repo_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
