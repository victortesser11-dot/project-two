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
      agente_camera: {
        Row: {
          ativo: boolean
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          nome: string
          projeto_id: string
          token_hash: string
          ultimo_contato_em: string | null
          versao: string | null
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          nome: string
          projeto_id: string
          token_hash: string
          ultimo_contato_em?: string | null
          versao?: string | null
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          projeto_id?: string
          token_hash?: string
          ultimo_contato_em?: string | null
          versao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agente_camera_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agente_camera_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      apontamento_mao_obra: {
        Row: {
          data: string
          empresa_id: string
          horas: number | null
          id: string
          presente: boolean
          projeto_id: string
          quantidade: number | null
          registrado_em: string
          registrado_por: string | null
          tarefa_id: string | null
          trabalhador_id: string
        }
        Insert: {
          data: string
          empresa_id: string
          horas?: number | null
          id?: string
          presente: boolean
          projeto_id: string
          quantidade?: number | null
          registrado_em?: string
          registrado_por?: string | null
          tarefa_id?: string | null
          trabalhador_id: string
        }
        Update: {
          data?: string
          empresa_id?: string
          horas?: number | null
          id?: string
          presente?: boolean
          projeto_id?: string
          quantidade?: number | null
          registrado_em?: string
          registrado_por?: string | null
          tarefa_id?: string | null
          trabalhador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apontamento_mao_obra_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamento_mao_obra_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamento_mao_obra_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamento_mao_obra_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhador"
            referencedColumns: ["id"]
          },
        ]
      }
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
      camera: {
        Row: {
          agente_id: string | null
          ativa: boolean
          atualizado_em: string
          criado_em: string
          empresa_id: string
          endereco: string | null
          falhas_seguidas: number
          horarios: string[]
          id: string
          nome: string
          origem: Database["public"]["Enums"]["origem_camera"]
          projeto_id: string
          senha_id: string | null
          tem_senha: boolean | null
          teste_caminho: string | null
          teste_erro: string | null
          teste_pedido_em: string | null
          teste_respondido_em: string | null
          ultima_foto_em: string | null
          ultimo_erro: string | null
          ultimo_erro_em: string | null
          usuario: string | null
        }
        Insert: {
          agente_id?: string | null
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id: string
          endereco?: string | null
          falhas_seguidas?: number
          horarios?: string[]
          id?: string
          nome: string
          origem: Database["public"]["Enums"]["origem_camera"]
          projeto_id: string
          senha_id?: string | null
          tem_senha?: boolean | null
          teste_caminho?: string | null
          teste_erro?: string | null
          teste_pedido_em?: string | null
          teste_respondido_em?: string | null
          ultima_foto_em?: string | null
          ultimo_erro?: string | null
          ultimo_erro_em?: string | null
          usuario?: string | null
        }
        Update: {
          agente_id?: string | null
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id?: string
          endereco?: string | null
          falhas_seguidas?: number
          horarios?: string[]
          id?: string
          nome?: string
          origem?: Database["public"]["Enums"]["origem_camera"]
          projeto_id?: string
          senha_id?: string | null
          tem_senha?: boolean | null
          teste_caminho?: string | null
          teste_erro?: string | null
          teste_pedido_em?: string | null
          teste_respondido_em?: string | null
          ultima_foto_em?: string | null
          ultimo_erro?: string | null
          ultimo_erro_em?: string | null
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "camera_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agente_camera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camera_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      composicao_custo: {
        Row: {
          atualizado_em: string
          empresa_id: string
          equipamento: number
          mao_obra: number
          material: number
          outros: number
          projeto_id: string
          tarefa_id: string
          total: number | null
        }
        Insert: {
          atualizado_em?: string
          empresa_id: string
          equipamento?: number
          mao_obra?: number
          material?: number
          outros?: number
          projeto_id: string
          tarefa_id: string
          total?: number | null
        }
        Update: {
          atualizado_em?: string
          empresa_id?: string
          equipamento?: number
          mao_obra?: number
          material?: number
          outros?: number
          projeto_id?: string
          tarefa_id?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "composicao_custo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composicao_custo_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composicao_custo_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: true
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
        ]
      }
      compromisso: {
        Row: {
          atualizado_em: string
          cnpj: string | null
          criado_em: string
          criado_por: string | null
          data: string
          descricao: string
          empreiteira_id: string | null
          empresa_id: string
          encerrado: boolean
          encerrado_em: string | null
          fornecedor: string | null
          id: string
          projeto_id: string
          tarefa_id: string | null
          tipo: Database["public"]["Enums"]["tipo_compromisso"]
          valor: number
        }
        Insert: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          data: string
          descricao: string
          empreiteira_id?: string | null
          empresa_id: string
          encerrado?: boolean
          encerrado_em?: string | null
          fornecedor?: string | null
          id?: string
          projeto_id: string
          tarefa_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_compromisso"]
          valor: number
        }
        Update: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          criado_por?: string | null
          data?: string
          descricao?: string
          empreiteira_id?: string | null
          empresa_id?: string
          encerrado?: boolean
          encerrado_em?: string | null
          fornecedor?: string | null
          id?: string
          projeto_id?: string
          tarefa_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_compromisso"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "compromisso_empreiteira_id_fkey"
            columns: ["empreiteira_id"]
            isOneToOne: false
            referencedRelation: "empreiteira"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromisso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromisso_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromisso_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
        ]
      }
      custo_mao_obra: {
        Row: {
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          tipo: Database["public"]["Enums"]["tipo_custo_mao_obra"]
          trabalhador_id: string
          unidade_producao: string | null
          valor: number
          vigente_desde: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          tipo: Database["public"]["Enums"]["tipo_custo_mao_obra"]
          trabalhador_id: string
          unidade_producao?: string | null
          valor: number
          vigente_desde: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          tipo?: Database["public"]["Enums"]["tipo_custo_mao_obra"]
          trabalhador_id?: string
          unidade_producao?: string | null
          valor?: number
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "custo_mao_obra_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custo_mao_obra_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhador"
            referencedColumns: ["id"]
          },
        ]
      }
      despesa: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_despesa"]
          compromisso_id: string | null
          data: string
          descricao: string
          documento: string | null
          empresa_id: string
          fornecedor: string | null
          id: string
          projeto_id: string
          registrado_em: string
          registrado_por: string | null
          tarefa_id: string | null
          valor: number
        }
        Insert: {
          categoria: Database["public"]["Enums"]["categoria_despesa"]
          compromisso_id?: string | null
          data: string
          descricao: string
          documento?: string | null
          empresa_id: string
          fornecedor?: string | null
          id?: string
          projeto_id: string
          registrado_em?: string
          registrado_por?: string | null
          tarefa_id?: string | null
          valor: number
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_despesa"]
          compromisso_id?: string | null
          data?: string
          descricao?: string
          documento?: string | null
          empresa_id?: string
          fornecedor?: string | null
          id?: string
          projeto_id?: string
          registrado_em?: string
          registrado_por?: string | null
          tarefa_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesa_compromisso_id_fkey"
            columns: ["compromisso_id"]
            isOneToOne: false
            referencedRelation: "compromisso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesa_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesa_tarefa_id_fkey"
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
      empreiteira: {
        Row: {
          ativa: boolean
          atualizado_em: string
          cnpj: string | null
          criado_em: string
          empresa_id: string
          id: string
          nome: string
          situacao_cnpj: string | null
          telefone: string | null
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          nome: string
          situacao_cnpj?: string | null
          telefone?: string | null
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          nome?: string
          situacao_cnpj?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empreiteira_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
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
      emprestimo_ferramenta: {
        Row: {
          devolver_ate: string | null
          devolvida_em: string | null
          devolvido_por: string | null
          empresa_id: string
          id: string
          item_id: string
          observacao: string | null
          projeto_id: string
          responsavel: string
          retirada_em: string
          retirado_por: string | null
          trabalhador_id: string | null
        }
        Insert: {
          devolver_ate?: string | null
          devolvida_em?: string | null
          devolvido_por?: string | null
          empresa_id: string
          id?: string
          item_id: string
          observacao?: string | null
          projeto_id: string
          responsavel: string
          retirada_em?: string
          retirado_por?: string | null
          trabalhador_id?: string | null
        }
        Update: {
          devolver_ate?: string | null
          devolvida_em?: string | null
          devolvido_por?: string | null
          empresa_id?: string
          id?: string
          item_id?: string
          observacao?: string | null
          projeto_id?: string
          responsavel?: string
          retirada_em?: string
          retirado_por?: string | null
          trabalhador_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emprestimo_ferramenta_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimo_ferramenta_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimo_ferramenta_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimo_ferramenta_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhador"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_projeto: {
        Row: {
          ativo: boolean
          empresa_id: string
          incluido_em: string
          projeto_id: string
          trabalhador_id: string
        }
        Insert: {
          ativo?: boolean
          empresa_id: string
          incluido_em?: string
          projeto_id: string
          trabalhador_id: string
        }
        Update: {
          ativo?: boolean
          empresa_id?: string
          incluido_em?: string
          projeto_id?: string
          trabalhador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_projeto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_projeto_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_projeto_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhador"
            referencedColumns: ["id"]
          },
        ]
      }
      foto_camera: {
        Row: {
          camera_id: string
          caminho: string
          capturada_em: string
          criado_em: string
          data: string
          empresa_id: string
          enviada_por: string | null
          id: string
          origem: Database["public"]["Enums"]["origem_camera"]
          projeto_id: string
          tamanho_bytes: number | null
        }
        Insert: {
          camera_id: string
          caminho: string
          capturada_em: string
          criado_em?: string
          data: string
          empresa_id: string
          enviada_por?: string | null
          id?: string
          origem: Database["public"]["Enums"]["origem_camera"]
          projeto_id: string
          tamanho_bytes?: number | null
        }
        Update: {
          camera_id?: string
          caminho?: string
          capturada_em?: string
          criado_em?: string
          data?: string
          empresa_id?: string
          enviada_por?: string | null
          id?: string
          origem?: Database["public"]["Enums"]["origem_camera"]
          projeto_id?: string
          tamanho_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "foto_camera_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "camera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foto_camera_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foto_camera_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      item_estoque: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string | null
          codigo: string
          criado_em: string
          empresa_id: string
          estoque_minimo: number
          id: string
          ncm: string | null
          nome: string
          patrimonio: string | null
          tipo: Database["public"]["Enums"]["tipo_item_estoque"]
          unidade: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          codigo: string
          criado_em?: string
          empresa_id: string
          estoque_minimo?: number
          id?: string
          ncm?: string | null
          nome: string
          patrimonio?: string | null
          tipo: Database["public"]["Enums"]["tipo_item_estoque"]
          unidade: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string | null
          codigo?: string
          criado_em?: string
          empresa_id?: string
          estoque_minimo?: number
          id?: string
          ncm?: string | null
          nome?: string
          patrimonio?: string | null
          tipo?: Database["public"]["Enums"]["tipo_item_estoque"]
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_estoque_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      item_fornecedor: {
        Row: {
          atualizado_em: string
          cnpj_fornecedor: string
          codigo_fornecedor: string
          empresa_id: string
          item_id: string
        }
        Insert: {
          atualizado_em?: string
          cnpj_fornecedor: string
          codigo_fornecedor: string
          empresa_id: string
          item_id: string
        }
        Update: {
          atualizado_em?: string
          cnpj_fornecedor?: string
          codigo_fornecedor?: string
          empresa_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_fornecedor_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_fornecedor_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_estoque"
            referencedColumns: ["id"]
          },
        ]
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
      movimento_estoque: {
        Row: {
          chave_nfe: string | null
          cnpj_fornecedor: string | null
          data: string
          empresa_id: string
          fornecedor: string | null
          id: string
          item_id: string
          nota_fiscal: string | null
          observacao: string | null
          projeto_id: string
          quantidade: number
          registrado_em: string
          registrado_por: string | null
          responsavel: string | null
          tarefa_id: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento_estoque"]
          trabalhador_id: string | null
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          chave_nfe?: string | null
          cnpj_fornecedor?: string | null
          data: string
          empresa_id: string
          fornecedor?: string | null
          id?: string
          item_id: string
          nota_fiscal?: string | null
          observacao?: string | null
          projeto_id: string
          quantidade: number
          registrado_em?: string
          registrado_por?: string | null
          responsavel?: string | null
          tarefa_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimento_estoque"]
          trabalhador_id?: string | null
          valor_total?: number | null
          valor_unitario: number
        }
        Update: {
          chave_nfe?: string | null
          cnpj_fornecedor?: string | null
          data?: string
          empresa_id?: string
          fornecedor?: string | null
          id?: string
          item_id?: string
          nota_fiscal?: string | null
          observacao?: string | null
          projeto_id?: string
          quantidade?: number
          registrado_em?: string
          registrado_por?: string | null
          responsavel?: string | null
          tarefa_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimento_estoque"]
          trabalhador_id?: string | null
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimento_estoque_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_estoque_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_estoque_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_estoque_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "eap_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_estoque_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhador"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamento_versao: {
        Row: {
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          itens: Json
          nome: string
          projeto_id: string
          total: number
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          itens: Json
          nome: string
          projeto_id: string
          total: number
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          itens?: Json
          nome?: string
          projeto_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_versao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_versao_projeto_id_fkey"
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
      regra_semaforo: {
        Row: {
          atraso_amarelo_dias: number
          atraso_vermelho_dias: number
          atualizado_em: string
          custo_amarelo_pct: number
          custo_vermelho_pct: number
          empresa_id: string
        }
        Insert: {
          atraso_amarelo_dias?: number
          atraso_vermelho_dias?: number
          atualizado_em?: string
          custo_amarelo_pct?: number
          custo_vermelho_pct?: number
          empresa_id: string
        }
        Update: {
          atraso_amarelo_dias?: number
          atraso_vermelho_dias?: number
          atualizado_em?: string
          custo_amarelo_pct?: number
          custo_vermelho_pct?: number
          empresa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regra_semaforo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
        ]
      }
      saldo_estoque: {
        Row: {
          atualizado_em: string
          custo_medio: number
          empresa_id: string
          id: string
          item_id: string
          projeto_id: string
          quantidade: number
        }
        Insert: {
          atualizado_em?: string
          custo_medio?: number
          empresa_id: string
          id?: string
          item_id: string
          projeto_id: string
          quantidade?: number
        }
        Update: {
          atualizado_em?: string
          custo_medio?: number
          empresa_id?: string
          id?: string
          item_id?: string
          projeto_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "saldo_estoque_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_estoque_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "item_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saldo_estoque_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projeto"
            referencedColumns: ["id"]
          },
        ]
      }
      trabalhador: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cpf: string | null
          cpf_mascarado: string | null
          criado_em: string
          empreiteira_id: string | null
          empresa_id: string
          funcao: string
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cpf?: string | null
          cpf_mascarado?: string | null
          criado_em?: string
          empreiteira_id?: string | null
          empresa_id: string
          funcao: string
          id?: string
          nome: string
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cpf?: string | null
          cpf_mascarado?: string | null
          criado_em?: string
          empreiteira_id?: string | null
          empresa_id?: string
          funcao?: string
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trabalhador_empreiteira_id_fkey"
            columns: ["empreiteira_id"]
            isOneToOne: false
            referencedRelation: "empreiteira"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabalhador_empresa_id_fkey"
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
      agente_config: {
        Args: { p_token: string; p_versao?: string }
        Returns: Json
      }
      agente_pasta_camera: {
        Args: { p_camera_id: string; p_token: string }
        Returns: string
      }
      agente_registrar_falha: {
        Args: {
          p_camera_id: string
          p_erro: string
          p_teste?: boolean
          p_token: string
        }
        Returns: number
      }
      agente_registrar_foto: {
        Args: {
          p_camera_id: string
          p_caminho: string
          p_capturada_em: string
          p_tamanho?: number
          p_teste?: boolean
          p_token: string
        }
        Returns: string
      }
      assinar_diario: { Args: { p_diario_id: string }; Returns: string }
      atualizar_item_eap: {
        Args: { p_campos: Json; p_id: string }
        Returns: undefined
      }
      criar_agente_camera: {
        Args: { p_nome: string; p_projeto_id: string }
        Returns: Json
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
      custo_mao_obra_projeto: {
        Args: { p_ate?: string; p_de?: string; p_projeto_id: string }
        Returns: {
          custo: number
          data: string
          horas: number
          quantidade: number
          tarefa_id: string
          tipo: Database["public"]["Enums"]["tipo_custo_mao_obra"]
          trabalhador_id: string
          valor_unitario: number
        }[]
      }
      custo_realizado_por_dia: {
        Args: { p_projeto_id: string }
        Returns: {
          data: string
          despesas: number
          mao_obra: number
          material: number
        }[]
      }
      definir_composicao_custo: {
        Args: {
          p_equipamento: number
          p_mao_obra: number
          p_material: number
          p_outros: number
          p_tarefa_id: string
        }
        Returns: number
      }
      definir_custo_mao_obra: {
        Args: {
          p_tipo: Database["public"]["Enums"]["tipo_custo_mao_obra"]
          p_trabalhador_id: string
          p_unidade_producao?: string
          p_valor: number
          p_vigente_desde: string
        }
        Returns: string
      }
      definir_efetivo: {
        Args: { p_diario_id: string; p_linhas: Json }
        Returns: number
      }
      definir_linha_base: { Args: { p_projeto_id: string }; Returns: number }
      definir_regras_semaforo: {
        Args: {
          p_atraso_amarelo_dias: number
          p_atraso_vermelho_dias: number
          p_custo_amarelo_pct: number
          p_custo_vermelho_pct: number
          p_empresa_id: string
        }
        Returns: undefined
      }
      devolver_ferramenta: {
        Args: { p_item_id: string; p_observacao?: string }
        Returns: number
      }
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
      emprestar_ferramenta: {
        Args: {
          p_devolver_ate?: string
          p_item_id: string
          p_observacao?: string
          p_projeto_id: string
          p_responsavel?: string
          p_trabalhador_id?: string
        }
        Returns: string
      }
      encerrar_compromisso: {
        Args: { p_encerrado?: boolean; p_id: string }
        Returns: undefined
      }
      excluir_despesa: { Args: { p_id: string }; Returns: undefined }
      excluir_foto_camera: { Args: { p_id: string }; Returns: string }
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
      orcado_realizado: {
        Args: { p_projeto_id: string }
        Returns: {
          comprometido: number
          despesas: number
          mao_obra: number
          material: number
          orcado: number
          tarefa_id: string
        }[]
      }
      pedir_teste_camera: { Args: { p_id: string }; Returns: undefined }
      registrar_ajuste: {
        Args: {
          p_data: string
          p_item_id: string
          p_motivo: string
          p_projeto_id: string
          p_quantidade_contada: number
        }
        Returns: number
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
      registrar_chamada: {
        Args: { p_data: string; p_linhas: Json; p_projeto_id: string }
        Returns: number
      }
      registrar_despesa: {
        Args: {
          p_categoria: Database["public"]["Enums"]["categoria_despesa"]
          p_compromisso_id?: string
          p_data: string
          p_descricao: string
          p_documento?: string
          p_fornecedor?: string
          p_projeto_id: string
          p_tarefa_id: string
          p_valor: number
        }
        Returns: string
      }
      registrar_entradas: {
        Args: {
          p_chave_nfe?: string
          p_cnpj_fornecedor?: string
          p_data: string
          p_fornecedor?: string
          p_itens: Json
          p_nota_fiscal?: string
          p_projeto_id: string
        }
        Returns: number
      }
      registrar_foto_camera: {
        Args: {
          p_camera_id: string
          p_caminho: string
          p_capturada_em?: string
          p_id: string
          p_tamanho?: number
        }
        Returns: string
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
      registrar_saida: {
        Args: {
          p_data: string
          p_item_id: string
          p_observacao?: string
          p_projeto_id: string
          p_quantidade: number
          p_responsavel?: string
          p_tarefa_id: string
          p_trabalhador_id?: string
        }
        Returns: number
      }
      remover_dependencia: { Args: { p_id: string }; Returns: undefined }
      reposicionar_item_eap: {
        Args: { p_acao: string; p_id: string }
        Returns: undefined
      }
      revogar_agente_camera: { Args: { p_id: string }; Returns: undefined }
      salvar_camera: {
        Args: {
          p_campos: Json
          p_id: string
          p_projeto_id: string
          p_senha?: string
        }
        Returns: string
      }
      salvar_compromisso: {
        Args: { p_campos: Json; p_id: string; p_projeto_id: string }
        Returns: string
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
      salvar_versao_orcamento: {
        Args: { p_nome: string; p_projeto_id: string }
        Returns: string
      }
    }
    Enums: {
      categoria_despesa:
        | "equipamento"
        | "servico"
        | "material"
        | "frete"
        | "taxa"
        | "administracao"
        | "outros"
      clima_periodo: "sol" | "nublado" | "chuva" | "chuva_forte"
      origem_camera: "agente" | "manual"
      papel_empresa: "admin" | "membro"
      papel_projeto:
        | "engenheiro"
        | "mestre"
        | "almoxarife"
        | "financeiro"
        | "leitura"
      status_diario: "rascunho" | "assinado"
      status_projeto: "planejamento" | "em_andamento" | "pausado" | "concluido"
      tipo_compromisso: "contrato" | "pedido"
      tipo_custo_mao_obra: "hora" | "diaria" | "producao"
      tipo_dependencia: "ti" | "ii" | "tt"
      tipo_item_eap: "etapa" | "tarefa"
      tipo_item_estoque: "material" | "ferramenta"
      tipo_movimento_estoque: "entrada" | "saida" | "ajuste"
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
      categoria_despesa: [
        "equipamento",
        "servico",
        "material",
        "frete",
        "taxa",
        "administracao",
        "outros",
      ],
      clima_periodo: ["sol", "nublado", "chuva", "chuva_forte"],
      origem_camera: ["agente", "manual"],
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
      tipo_compromisso: ["contrato", "pedido"],
      tipo_custo_mao_obra: ["hora", "diaria", "producao"],
      tipo_dependencia: ["ti", "ii", "tt"],
      tipo_item_eap: ["etapa", "tarefa"],
      tipo_item_estoque: ["material", "ferramenta"],
      tipo_movimento_estoque: ["entrada", "saida", "ajuste"],
    },
  },
} as const
