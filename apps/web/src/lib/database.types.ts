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
      avanco_tarefa: {
        Row: {
          data: string
          empresa_id: string
          id: string
          observacao: string | null
          percentual: number
          projeto_id: string
          quantidade_feita: number | null
          registrado_em: string
          registrado_por: string | null
          tarefa_id: string
        }
        Insert: {
          data: string
          empresa_id: string
          id: string
          observacao?: string | null
          percentual: number
          projeto_id: string
          quantidade_feita?: number | null
          registrado_em?: string
          registrado_por?: string | null
          tarefa_id: string
        }
        Update: {
          data?: string
          empresa_id?: string
          id?: string
          observacao?: string | null
          percentual?: number
          projeto_id?: string
          quantidade_feita?: number | null
          registrado_em?: string
          registrado_por?: string | null
          tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avanco_tarefa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avanco_tarefa_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avanco_tarefa_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
        ]
      }
      diario_efetivo: {
        Row: {
          diario_id: string
          empresa_id: string
          empresa_terceira: string | null
          funcao: string
          id: string
          ordem: number
          projeto_id: string
          quantidade: number
        }
        Insert: {
          diario_id: string
          empresa_id: string
          empresa_terceira?: string | null
          funcao: string
          id?: string
          ordem: number
          projeto_id: string
          quantidade: number
        }
        Update: {
          diario_id?: string
          empresa_id?: string
          empresa_terceira?: string | null
          funcao?: string
          id?: string
          ordem?: number
          projeto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "diario_efetivo_diario_id_fkey"
            columns: ["diario_id"]
            isOneToOne: false
            referencedRelation: "diario_obra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_efetivo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_efetivo_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      diario_foto: {
        Row: {
          caminho: string
          criado_em: string
          diario_id: string
          empresa_id: string
          enviado_por: string | null
          id: string
          legenda: string | null
          projeto_id: string
          tarefa_id: string | null
        }
        Insert: {
          caminho: string
          criado_em?: string
          diario_id: string
          empresa_id: string
          enviado_por?: string | null
          id: string
          legenda?: string | null
          projeto_id: string
          tarefa_id?: string | null
        }
        Update: {
          caminho?: string
          criado_em?: string
          diario_id?: string
          empresa_id?: string
          enviado_por?: string | null
          id?: string
          legenda?: string | null
          projeto_id?: string
          tarefa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diario_foto_diario_id_fkey"
            columns: ["diario_id"]
            isOneToOne: false
            referencedRelation: "diario_obra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_foto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_foto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_foto_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
        ]
      }
      diario_obra: {
        Row: {
          assinado_em: string | null
          assinado_nome: string | null
          assinado_por: string | null
          atualizado_em: string
          chuva_mm: number | null
          clima_automatico: boolean
          clima_manha: Database["public"]["Enums"]["clima_periodo"] | null
          clima_tarde: Database["public"]["Enums"]["clima_periodo"] | null
          conteudo_assinado: Json | null
          criado_em: string
          criado_por: string | null
          data: string
          empresa_id: string
          hash_conteudo: string | null
          id: string
          observacoes: string | null
          ocorrencias: string | null
          praticavel_manha: boolean
          praticavel_tarde: boolean
          projeto_id: string
          status: Database["public"]["Enums"]["status_diario"]
          temp_max: number | null
          temp_min: number | null
        }
        Insert: {
          assinado_em?: string | null
          assinado_nome?: string | null
          assinado_por?: string | null
          atualizado_em?: string
          chuva_mm?: number | null
          clima_automatico?: boolean
          clima_manha?: Database["public"]["Enums"]["clima_periodo"] | null
          clima_tarde?: Database["public"]["Enums"]["clima_periodo"] | null
          conteudo_assinado?: Json | null
          criado_em?: string
          criado_por?: string | null
          data: string
          empresa_id: string
          hash_conteudo?: string | null
          id?: string
          observacoes?: string | null
          ocorrencias?: string | null
          praticavel_manha?: boolean
          praticavel_tarde?: boolean
          projeto_id: string
          status?: Database["public"]["Enums"]["status_diario"]
          temp_max?: number | null
          temp_min?: number | null
        }
        Update: {
          assinado_em?: string | null
          assinado_nome?: string | null
          assinado_por?: string | null
          atualizado_em?: string
          chuva_mm?: number | null
          clima_automatico?: boolean
          clima_manha?: Database["public"]["Enums"]["clima_periodo"] | null
          clima_tarde?: Database["public"]["Enums"]["clima_periodo"] | null
          conteudo_assinado?: Json | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          empresa_id?: string
          hash_conteudo?: string | null
          id?: string
          observacoes?: string | null
          ocorrencias?: string | null
          praticavel_manha?: boolean
          praticavel_tarde?: boolean
          projeto_id?: string
          status?: Database["public"]["Enums"]["status_diario"]
          temp_max?: number | null
          temp_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "diario_obra_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_obra_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      eap_dependencia: {
        Row: {
          criado_em: string
          defasagem_dias: number
          empresa_id: string
          id: string
          predecessora_id: string
          projeto_id: string
          sucessora_id: string
          tipo: Database["public"]["Enums"]["tipo_dependencia"]
        }
        Insert: {
          criado_em?: string
          defasagem_dias?: number
          empresa_id: string
          id?: string
          predecessora_id: string
          projeto_id: string
          sucessora_id: string
          tipo?: Database["public"]["Enums"]["tipo_dependencia"]
        }
        Update: {
          criado_em?: string
          defasagem_dias?: number
          empresa_id?: string
          id?: string
          predecessora_id?: string
          projeto_id?: string
          sucessora_id?: string
          tipo?: Database["public"]["Enums"]["tipo_dependencia"]
        }
        Relationships: [
          {
            foreignKeyName: "eap_dependencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eap_dependencia_predecessora_id_fkey"
            columns: ["predecessora_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eap_dependencia_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eap_dependencia_sucessora_id_fkey"
            columns: ["sucessora_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
        ]
      }
      eap_item: {
        Row: {
          atualizado_em: string
          avanco_em: string | null
          codigo_externo: string | null
          criado_em: string
          custo_base: number | null
          custo_previsto: number | null
          empresa_id: string
          fim_base: string | null
          fim_previsto: string | null
          id: string
          inicio_base: string | null
          inicio_previsto: string | null
          nome: string
          ordem: number
          pai_id: string | null
          percentual_fisico: number
          projeto_id: string
          quantidade: number | null
          tipo: Database["public"]["Enums"]["tipo_item_eap"]
          unidade: string | null
        }
        Insert: {
          atualizado_em?: string
          avanco_em?: string | null
          codigo_externo?: string | null
          criado_em?: string
          custo_base?: number | null
          custo_previsto?: number | null
          empresa_id: string
          fim_base?: string | null
          fim_previsto?: string | null
          id?: string
          inicio_base?: string | null
          inicio_previsto?: string | null
          nome: string
          ordem: number
          pai_id?: string | null
          percentual_fisico?: number
          projeto_id: string
          quantidade?: number | null
          tipo: Database["public"]["Enums"]["tipo_item_eap"]
          unidade?: string | null
        }
        Update: {
          atualizado_em?: string
          avanco_em?: string | null
          codigo_externo?: string | null
          criado_em?: string
          custo_base?: number | null
          custo_previsto?: number | null
          empresa_id?: string
          fim_base?: string | null
          fim_previsto?: string | null
          id?: string
          inicio_base?: string | null
          inicio_previsto?: string | null
          nome?: string
          ordem?: number
          pai_id?: string | null
          percentual_fisico?: number
          projeto_id?: string
          quantidade?: number | null
          tipo?: Database["public"]["Enums"]["tipo_item_eap"]
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eap_item_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eap_item_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eap_item_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
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
      linha_base: {
        Row: {
          definida_em: string
          definida_por: string | null
          empresa_id: string
          projeto_id: string
          qtd_tarefas: number
        }
        Insert: {
          definida_em?: string
          definida_por?: string | null
          empresa_id: string
          projeto_id: string
          qtd_tarefas: number
        }
        Update: {
          definida_em?: string
          definida_por?: string | null
          empresa_id?: string
          projeto_id?: string
          qtd_tarefas?: number
        }
        Relationships: [
          {
            foreignKeyName: "linha_base_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linha_base_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: true
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
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
          latitude: number | null
          longitude: number | null
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
          latitude?: number | null
          longitude?: number | null
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
          latitude?: number | null
          longitude?: number | null
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
      adicionar_membro_projeto: {
        Args: {
          p_email: string
          p_papel?: Database["public"]["Enums"]["papel_projeto"]
          p_projeto_id: string
        }
        Returns: string
      }
      assinar_diario: { Args: { p_diario_id: string }; Returns: string }
      atualizar_item_eap: {
        Args: { p_campos: Json; p_id: string }
        Returns: undefined
      }
      criar_empresa: { Args: { p_nome: string }; Returns: string }
      criar_item_eap: {
        Args: {
          p_campos?: Json
          p_nome: string
          p_pai_id?: string
          p_posicao?: number
          p_projeto_id: string
          p_tipo: Database["public"]["Enums"]["tipo_item_eap"]
        }
        Returns: string
      }
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
      definir_efetivo: {
        Args: { p_diario_id: string; p_linhas: Json }
        Returns: number
      }
      definir_linha_base: { Args: { p_projeto_id: string }; Returns: number }
      eap_do_projeto: {
        Args: { p_projeto_id: string }
        Returns: {
          avanco_em: string
          codigo: string
          codigo_externo: string
          custo_base: number
          custo_previsto: number
          fim_base: string
          fim_previsto: string
          id: string
          inicio_base: string
          inicio_previsto: string
          nivel: number
          nome: string
          pai_id: string
          percentual_fisico: number
          posicao: number
          qtd_filhos: number
          qtd_tarefas: number
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_item_eap"]
          unidade: string
        }[]
      }
      excluir_foto_diario: { Args: { p_id: string }; Returns: string }
      excluir_item_eap: { Args: { p_id: string }; Returns: number }
      importar_eap: {
        Args: { p_itens: Json; p_projeto_id: string; p_substituir?: boolean }
        Returns: number
      }
      membros_do_projeto: {
        Args: { p_projeto_id: string }
        Returns: {
          admin_empresa: boolean
          email: string
          papel: Database["public"]["Enums"]["papel_projeto"]
          usuario_id: string
          voce: boolean
        }[]
      }
      mover_item_eap: {
        Args: { p_id: string; p_novo_pai_id: string; p_posicao?: number }
        Returns: undefined
      }
      registrar_avanco: {
        Args: {
          p_data: string
          p_id: string
          p_observacao?: string
          p_percentual?: number
          p_quantidade?: number
          p_tarefa_id: string
        }
        Returns: number
      }
      registrar_foto_diario: {
        Args: {
          p_caminho: string
          p_diario_id: string
          p_id: string
          p_legenda?: string
          p_tarefa_id?: string
        }
        Returns: string
      }
      remover_dependencia: { Args: { p_id: string }; Returns: undefined }
      reposicionar_item_eap: {
        Args: { p_acao: string; p_id: string }
        Returns: undefined
      }
      salvar_dependencia: {
        Args: {
          p_defasagem_dias?: number
          p_predecessora_id: string
          p_sucessora_id: string
          p_tipo?: Database["public"]["Enums"]["tipo_dependencia"]
        }
        Returns: number
      }
      salvar_diario: {
        Args: { p_campos?: Json; p_data: string; p_projeto_id: string }
        Returns: string
      }
    }
    Enums: {
      clima_periodo: "sol" | "nublado" | "chuva" | "chuva_forte"
      papel_empresa: "admin" | "membro"
      papel_projeto:
        | "engenheiro"
        | "mestre"
        | "almoxarife"
        | "financeiro"
        | "leitura"
      status_diario: "rascunho" | "assinado"
      status_projeto: "planejamento" | "em_andamento" | "pausado" | "concluido"
      tipo_dependencia: "ti" | "ii" | "tt"
      tipo_item_eap: "etapa" | "tarefa"
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

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      clima_periodo: ["sol", "nublado", "chuva", "chuva_forte"],
      papel_empresa: ["admin", "membro"],
      papel_projeto: [
        "engenheiro",
        "mestre",
        "almoxarife",
        "financeiro",
        "leitura",
      ],
      status_diario: ["rascunho", "assinado"],
      status_projeto: ["planejamento", "em_andamento", "pausado", "concluido"],
      tipo_dependencia: ["ti", "ii", "tt"],
      tipo_item_eap: ["etapa", "tarefa"],
    },
  },
} as const
