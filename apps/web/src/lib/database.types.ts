// Gerado a partir do banco Supabase (não editar à mão).
// Para atualizar: supabase gen types typescript --project-id bxsaaabxbzlddpahdrto > apps/web/src/lib/database.types.ts

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          acao: string
          antes: Json | null
          criado_em: string
          depois: Json | null
          empresa_id: string
          id: number
          registro_id: string
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          antes?: Json | null
          criado_em?: string
          depois?: Json | null
          empresa_id: string
          id?: never
          registro_id: string
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          antes?: Json | null
          criado_em?: string
          depois?: Json | null
          empresa_id?: string
          id?: never
          registro_id?: string
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      empresa: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      membro_empresa: {
        Row: {
          criado_em: string
          empresa_id: string
          papel: Database["public"]["Enums"]["papel_empresa"]
          usuario_id: string
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          papel?: Database["public"]["Enums"]["papel_empresa"]
          usuario_id: string
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          papel?: Database["public"]["Enums"]["papel_empresa"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membro_empresa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      membro_projeto: {
        Row: {
          criado_em: string
          empresa_id: string
          papel: Database["public"]["Enums"]["papel_projeto"]
          projeto_id: string
          usuario_id: string
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          papel?: Database["public"]["Enums"]["papel_projeto"]
          projeto_id: string
          usuario_id: string
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          papel?: Database["public"]["Enums"]["papel_projeto"]
          projeto_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membro_projeto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membro_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      projeto: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          data_fim_prevista: string | null
          data_inicio: string | null
          empresa_id: string
          endereco: string | null
          id: string
          nome: string
          orcamento_total: number | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_projeto"]
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          empresa_id: string
          endereco?: string | null
          id?: string
          nome: string
          orcamento_total?: number | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_projeto"]
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          empresa_id?: string
          endereco?: string | null
          id?: string
          nome?: string
          orcamento_total?: number | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_projeto"]
        }
        Relationships: [
          {
            foreignKeyName: "projeto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adicionar_membro_empresa: {
        Args: {
          p_email: string
          p_empresa_id: string
          p_papel?: Database["public"]["Enums"]["papel_empresa"]
        }
        Returns: string
      }
      criar_empresa: { Args: { p_nome: string }; Returns: string }
      criar_projeto: {
        Args: {
          p_data_fim_prevista?: string
          p_data_inicio?: string
          p_empresa_id: string
          p_endereco?: string
          p_nome: string
          p_orcamento_total?: number
          p_status?: Database["public"]["Enums"]["status_projeto"]
        }
        Returns: string
      }
    }
    Enums: {
      papel_empresa: "admin" | "membro"
      papel_projeto:
        | "engenheiro"
        | "mestre"
        | "almoxarife"
        | "financeiro"
        | "leitura"
      status_projeto: "planejamento" | "em_andamento" | "pausado" | "concluido"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
