export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      achievement_events: {
        Row: {
          achievement_id: string;
          created_at: string;
          event_date: string;
          id: string;
          kind: Database["public"]["Enums"]["achievement_event_kind"];
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          note: string | null;
          operation_id: string;
          owner_id: string;
          title: string | null;
          unit: string | null;
          updated_at: string;
          value: number | null;
        };
        Insert: {
          achievement_id: string;
          created_at?: string;
          event_date: string;
          id?: string;
          kind: Database["public"]["Enums"]["achievement_event_kind"];
          moderation_status?: Database["public"]["Enums"]["moderation_status"];
          note?: string | null;
          operation_id: string;
          owner_id: string;
          title?: string | null;
          unit?: string | null;
          updated_at?: string;
          value?: number | null;
        };
        Update: {
          achievement_id?: string;
          created_at?: string;
          event_date?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["achievement_event_kind"];
          moderation_status?: Database["public"]["Enums"]["moderation_status"];
          note?: string | null;
          operation_id?: string;
          owner_id?: string;
          title?: string | null;
          unit?: string | null;
          updated_at?: string;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "achievement_events_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "achievement_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      achievement_generation_jobs: {
        Row: {
          achievement_id: string;
          attempt: number;
          available_at: string;
          created_at: string;
          error_message: string | null;
          finished_at: string | null;
          heartbeat_at: string | null;
          id: string;
          lease_expires_at: string | null;
          lease_token: string | null;
          owner_id: string;
          provider: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["generation_job_status"];
          updated_at: string;
          worker_id: string | null;
        };
        Insert: {
          achievement_id: string;
          attempt?: number;
          available_at?: string;
          created_at?: string;
          error_message?: string | null;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          owner_id: string;
          provider?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["generation_job_status"];
          updated_at?: string;
          worker_id?: string | null;
        };
        Update: {
          achievement_id?: string;
          attempt?: number;
          available_at?: string;
          created_at?: string;
          error_message?: string | null;
          finished_at?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          owner_id?: string;
          provider?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["generation_job_status"];
          updated_at?: string;
          worker_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "achievement_generation_jobs_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "achievement_generation_jobs_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      achievements: {
        Row: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at: string | null;
          completed_at: string | null;
          cover_key: string | null;
          cover_url: string | null;
          created_at: string;
          date_overridden: boolean;
          description: string;
          description_overridden: boolean;
          failure_reason: string | null;
          hidden_at: string | null;
          id: string;
          idempotency_key: string;
          image_provider: string | null;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string | null;
          revoked_at: string | null;
          search_document: unknown;
          source_key: string | null;
          source_kind: Database["public"]["Enums"]["achievement_source_kind"];
          status: Database["public"]["Enums"]["achievement_status"];
          tags: string[];
          target_date: string | null;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        };
        Insert: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at?: string | null;
          completed_at?: string | null;
          cover_key?: string | null;
          cover_url?: string | null;
          created_at?: string;
          date_overridden?: boolean;
          description: string;
          description_overridden?: boolean;
          failure_reason?: string | null;
          hidden_at?: string | null;
          id?: string;
          idempotency_key: string;
          image_provider?: string | null;
          lifecycle_status?: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count?: number;
          moderation_status?: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at?: string | null;
          revoked_at?: string | null;
          search_document?: unknown;
          source_key?: string | null;
          source_kind?: Database["public"]["Enums"]["achievement_source_kind"];
          status?: Database["public"]["Enums"]["achievement_status"];
          tags?: string[];
          target_date?: string | null;
          title: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["achievement_visibility"];
        };
        Update: {
          achievement_date?: string;
          category?: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at?: string | null;
          completed_at?: string | null;
          cover_key?: string | null;
          cover_url?: string | null;
          created_at?: string;
          date_overridden?: boolean;
          description?: string;
          description_overridden?: boolean;
          failure_reason?: string | null;
          hidden_at?: string | null;
          id?: string;
          idempotency_key?: string;
          image_provider?: string | null;
          lifecycle_status?: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count?: number;
          moderation_status?: Database["public"]["Enums"]["moderation_status"];
          owner_id?: string;
          rarity?: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at?: string | null;
          revoked_at?: string | null;
          search_document?: unknown;
          source_key?: string | null;
          source_kind?: Database["public"]["Enums"]["achievement_source_kind"];
          status?: Database["public"]["Enums"]["achievement_status"];
          tags?: string[];
          target_date?: string | null;
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["achievement_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "achievements_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_reports: {
        Row: {
          achievement_id: string | null;
          created_at: string;
          detail: string | null;
          id: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reported_user_id: string | null;
          reporter_id: string;
        };
        Insert: {
          achievement_id?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          reason: Database["public"]["Enums"]["report_reason"];
          reported_user_id?: string | null;
          reporter_id: string;
        };
        Update: {
          achievement_id?: string | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["report_reason"];
          reported_user_id?: string | null;
          reporter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_reports_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_reported_user_id_fkey";
            columns: ["reported_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      country_catalog: {
        Row: {
          country_code: string;
          counts_toward_milestones: boolean;
          region: string;
        };
        Insert: {
          country_code: string;
          counts_toward_milestones?: boolean;
          region: string;
        };
        Update: {
          country_code?: string;
          counts_toward_milestones?: boolean;
          region?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          enabled: boolean;
          key: string;
          rollout_percentage: number;
          updated_at: string;
        };
        Insert: {
          enabled?: boolean;
          key: string;
          rollout_percentage?: number;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          key?: string;
          rollout_percentage?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      feed_actions: {
        Row: {
          achievement_id: string;
          action: Database["public"]["Enums"]["feed_action_type"];
          created_at: string;
          id: string;
          operation_id: string | null;
          previous_liked: boolean | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          action: Database["public"]["Enums"]["feed_action_type"];
          created_at?: string;
          id?: string;
          operation_id?: string | null;
          previous_liked?: boolean | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          action?: Database["public"]["Enums"]["feed_action_type"];
          created_at?: string;
          id?: string;
          operation_id?: string | null;
          previous_liked?: boolean | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feed_actions_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feed_actions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      friendships: {
        Row: {
          addressee_id: string;
          created_at: string;
          id: string;
          requester_id: string;
          status: Database["public"]["Enums"]["friendship_status"];
          updated_at: string;
          user_high: string | null;
          user_low: string | null;
        };
        Insert: {
          addressee_id: string;
          created_at?: string;
          id?: string;
          requester_id: string;
          status?: Database["public"]["Enums"]["friendship_status"];
          updated_at?: string;
          user_high?: string | null;
          user_low?: string | null;
        };
        Update: {
          addressee_id?: string;
          created_at?: string;
          id?: string;
          requester_id?: string;
          status?: Database["public"]["Enums"]["friendship_status"];
          updated_at?: string;
          user_high?: string | null;
          user_low?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey";
            columns: ["addressee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friendships_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      likes: {
        Row: {
          achievement_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "likes_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          achievement_id: string | null;
          actor_id: string | null;
          body: string;
          created_at: string;
          dedupe_key: string | null;
          id: string;
          link: string;
          owner_id: string;
          read_at: string | null;
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
        };
        Insert: {
          achievement_id?: string | null;
          actor_id?: string | null;
          body: string;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          link: string;
          owner_id: string;
          read_at?: string | null;
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
        };
        Update: {
          achievement_id?: string | null;
          actor_id?: string | null;
          body?: string;
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          link?: string;
          owner_id?: string;
          read_at?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["notification_type"];
        };
        Relationships: [
          {
            foreignKeyName: "notifications_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      product_analytics_events: {
        Row: {
          created_at: string;
          event_name: string;
          id: string;
          operation_id: string;
          source: string;
          subject_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_name: string;
          id?: string;
          operation_id: string;
          source?: string;
          subject_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_name?: string;
          id?: string;
          operation_id?: string;
          source?: string;
          subject_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_analytics_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          achievement_count: number;
          avatar_key: string;
          bio: string | null;
          created_at: string;
          display_name: string;
          friend_count: number;
          id: string;
          is_discoverable: boolean;
          map_is_public: boolean;
          onboarding_completed: boolean;
          owner_achievement_count: number;
          owner_total_received_likes: number;
          time_zone: string;
          total_received_likes: number;
          updated_at: string;
          username: string;
        };
        Insert: {
          achievement_count?: number;
          avatar_key?: string;
          bio?: string | null;
          created_at?: string;
          display_name: string;
          friend_count?: number;
          id: string;
          is_discoverable?: boolean;
          map_is_public?: boolean;
          onboarding_completed?: boolean;
          owner_achievement_count?: number;
          owner_total_received_likes?: number;
          time_zone?: string;
          total_received_likes?: number;
          updated_at?: string;
          username: string;
        };
        Update: {
          achievement_count?: number;
          avatar_key?: string;
          bio?: string | null;
          created_at?: string;
          display_name?: string;
          friend_count?: number;
          id?: string;
          is_discoverable?: boolean;
          map_is_public?: boolean;
          onboarding_completed?: boolean;
          owner_achievement_count?: number;
          owner_total_received_likes?: number;
          time_zone?: string;
          total_received_likes?: number;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      push_deliveries: {
        Row: {
          attempt: number;
          available_at: string;
          body: string;
          created_at: string;
          device_id: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          lease_expires_at: string | null;
          lease_token: string | null;
          link: string;
          notification_id: string | null;
          provider_receipt_id: string | null;
          provider_ticket_id: string | null;
          status: Database["public"]["Enums"]["push_delivery_status"];
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attempt?: number;
          available_at?: string;
          body: string;
          created_at?: string;
          device_id: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          link: string;
          notification_id?: string | null;
          provider_receipt_id?: string | null;
          provider_ticket_id?: string | null;
          status?: Database["public"]["Enums"]["push_delivery_status"];
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempt?: number;
          available_at?: string;
          body?: string;
          created_at?: string;
          device_id?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          link?: string;
          notification_id?: string | null;
          provider_receipt_id?: string | null;
          provider_ticket_id?: string | null;
          status?: Database["public"]["Enums"]["push_delivery_status"];
          title?: string;
          type?: Database["public"]["Enums"]["notification_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_deliveries_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "push_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_deliveries_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_deliveries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      push_devices: {
        Row: {
          created_at: string;
          disabled_at: string | null;
          enabled: boolean;
          expo_push_token: string;
          id: string;
          installation_id: string;
          last_seen_at: string;
          platform: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          disabled_at?: string | null;
          enabled?: boolean;
          expo_push_token: string;
          id?: string;
          installation_id: string;
          last_seen_at?: string;
          platform: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          disabled_at?: string | null;
          enabled?: boolean;
          expo_push_token?: string;
          id?: string;
          installation_id?: string;
          last_seen_at?: string;
          platform?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_devices_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_author_scores: {
        Row: {
          author_id: string;
          score: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          author_id: string;
          score?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          author_id?: string;
          score?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recommendation_author_scores_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendation_author_scores_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_category_scores: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category"];
          score: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"];
          score?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"];
          score?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recommendation_category_scores_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_engagement_events: {
        Row: {
          achievement_id: string;
          category: Database["public"]["Enums"]["achievement_category"];
          created_at: string;
          duration_ms: number | null;
          event_type: string;
          id: string;
          operation_id: string;
          owner_id: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          category: Database["public"]["Enums"]["achievement_category"];
          created_at?: string;
          duration_ms?: number | null;
          event_type: string;
          id?: string;
          operation_id: string;
          owner_id: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          category?: Database["public"]["Enums"]["achievement_category"];
          created_at?: string;
          duration_ms?: number | null;
          event_type?: string;
          id?: string;
          operation_id?: string;
          owner_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recommendation_engagement_events_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendation_engagement_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendation_engagement_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_events: {
        Row: {
          achievement_id: string;
          action: Database["public"]["Enums"]["recommendation_action"];
          category: Database["public"]["Enums"]["achievement_category"];
          created_at: string;
          id: string;
          operation_id: string;
          previous_liked: boolean;
          score_delta: number;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          action: Database["public"]["Enums"]["recommendation_action"];
          category: Database["public"]["Enums"]["achievement_category"];
          created_at?: string;
          id?: string;
          operation_id: string;
          previous_liked: boolean;
          score_delta: number;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          action?: Database["public"]["Enums"]["recommendation_action"];
          category?: Database["public"]["Enums"]["achievement_category"];
          created_at?: string;
          id?: string;
          operation_id?: string;
          previous_liked?: boolean;
          score_delta?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recommendation_events_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendation_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_impressions: {
        Row: {
          achievement_id: string;
          first_seen_at: string;
          last_round_id: string | null;
          last_seen_at: string;
          user_id: string;
          view_count: number;
        };
        Insert: {
          achievement_id: string;
          first_seen_at?: string;
          last_round_id?: string | null;
          last_seen_at?: string;
          user_id: string;
          view_count?: number;
        };
        Update: {
          achievement_id?: string;
          first_seen_at?: string;
          last_round_id?: string | null;
          last_seen_at?: string;
          user_id?: string;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recommendation_impressions_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendation_impressions_last_round_id_fkey";
            columns: ["last_round_id"];
            isOneToOne: false;
            referencedRelation: "recommendation_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendation_impressions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_round_items: {
        Row: {
          achievement_id: string;
          created_at: string;
          rank: number;
          round_id: string;
        };
        Insert: {
          achievement_id: string;
          created_at?: string;
          rank: number;
          round_id: string;
        };
        Update: {
          achievement_id?: string;
          created_at?: string;
          rank?: number;
          round_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recommendation_round_items_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recommendation_round_items_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "recommendation_rounds";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_rounds: {
        Row: {
          closed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recommendation_rounds_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      travel_operations: {
        Row: {
          created_at: string;
          operation_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          operation_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          operation_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "travel_operations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          browser_notifications: boolean;
          collection_view_mode: string;
          created_at: string;
          default_visibility: Database["public"]["Enums"]["achievement_visibility"];
          discover_swipe_guide_seen_at: string | null;
          id: string;
          in_app_notifications: boolean;
          like_notifications: boolean;
          map_default_focus: string;
          profile_view_mode: string;
          push_friend_accepted: boolean;
          push_friend_requests: boolean;
          push_likes: boolean;
          push_notifications: boolean;
          push_patch_ready: boolean;
          push_private_preview: boolean;
          push_travel_awards: boolean;
          theme: Database["public"]["Enums"]["theme_preference"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          browser_notifications?: boolean;
          collection_view_mode?: string;
          created_at?: string;
          default_visibility?: Database["public"]["Enums"]["achievement_visibility"];
          discover_swipe_guide_seen_at?: string | null;
          id?: string;
          in_app_notifications?: boolean;
          like_notifications?: boolean;
          map_default_focus?: string;
          profile_view_mode?: string;
          push_friend_accepted?: boolean;
          push_friend_requests?: boolean;
          push_likes?: boolean;
          push_notifications?: boolean;
          push_patch_ready?: boolean;
          push_private_preview?: boolean;
          push_travel_awards?: boolean;
          theme?: Database["public"]["Enums"]["theme_preference"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          browser_notifications?: boolean;
          collection_view_mode?: string;
          created_at?: string;
          default_visibility?: Database["public"]["Enums"]["achievement_visibility"];
          discover_swipe_guide_seen_at?: string | null;
          id?: string;
          in_app_notifications?: boolean;
          like_notifications?: boolean;
          map_default_focus?: string;
          profile_view_mode?: string;
          push_friend_accepted?: boolean;
          push_friend_requests?: boolean;
          push_likes?: boolean;
          push_notifications?: boolean;
          push_patch_ready?: boolean;
          push_private_preview?: boolean;
          push_travel_awards?: boolean;
          theme?: Database["public"]["Enums"]["theme_preference"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      visited_countries: {
        Row: {
          country_code: string;
          country_name: string;
          created_at: string;
          note: string | null;
          status: Database["public"]["Enums"]["country_visit_status"];
          updated_at: string;
          user_id: string;
          visit_month: number | null;
          visit_year: number | null;
          visited_at: string;
        };
        Insert: {
          country_code: string;
          country_name: string;
          created_at?: string;
          note?: string | null;
          status?: Database["public"]["Enums"]["country_visit_status"];
          updated_at?: string;
          user_id: string;
          visit_month?: number | null;
          visit_year?: number | null;
          visited_at?: string;
        };
        Update: {
          country_code?: string;
          country_name?: string;
          created_at?: string;
          note?: string | null;
          status?: Database["public"]["Enums"]["country_visit_status"];
          updated_at?: string;
          user_id?: string;
          visit_month?: number | null;
          visit_year?: number | null;
          visited_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visited_countries_country_catalog_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "country_catalog";
            referencedColumns: ["country_code"];
          },
          {
            foreignKeyName: "visited_countries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_patch_event: {
        Args: {
          p_event_date: string;
          p_kind: Database["public"]["Enums"]["achievement_event_kind"];
          p_note: string;
          p_operation_id: string;
          p_patch_id: string;
          p_title: string;
          p_unit: string;
          p_value: number;
        };
        Returns: {
          achievement_id: string;
          created_at: string;
          event_date: string;
          id: string;
          kind: Database["public"]["Enums"]["achievement_event_kind"];
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          note: string | null;
          operation_id: string;
          owner_id: string;
          title: string | null;
          unit: string | null;
          updated_at: string;
          value: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "achievement_events";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      advance_discover_round_v1: { Args: never; Returns: undefined };
      apply_discover_feedback_v2: {
        Args: {
          p_achievement_id: string;
          p_action: Database["public"]["Enums"]["recommendation_action"];
          p_operation_id: string;
        };
        Returns: {
          category_score: number;
          like_count: number;
          liked: boolean;
          previous_liked: boolean;
        }[];
      };
      apply_feed_action: {
        Args: {
          p_achievement_id: string;
          p_action: Database["public"]["Enums"]["feed_action_type"];
          p_operation_id: string;
        };
        Returns: {
          like_count: number;
          liked: boolean;
          previous_liked: boolean;
        }[];
      };
      block_user: { Args: { p_user_id: string }; Returns: undefined };
      cancel_friend_request: {
        Args: { p_profile_id: string };
        Returns: undefined;
      };
      claim_achievement_generation_jobs: {
        Args: {
          p_lease_seconds?: number;
          p_limit?: number;
          p_worker_id?: string;
        };
        Returns: {
          achievement_id: string;
          attempt: number;
          category: Database["public"]["Enums"]["achievement_category"];
          idempotency_key: string;
          job_id: string;
          lease_expires_at: string;
          lease_token: string;
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          title: string;
        }[];
      };
      claim_push_deliveries: {
        Args: {
          p_lease_seconds?: number;
          p_limit?: number;
          p_worker_id: string;
        };
        Returns: {
          body: string;
          expo_push_token: string;
          id: string;
          lease_token: string;
          link: string;
          title: string;
          type: Database["public"]["Enums"]["notification_type"];
        }[];
      };
      complete_achievement_generation_job:
        | {
            Args: { p_cover_key: string; p_job_id: string; p_provider: string };
            Returns: string;
          }
        | {
            Args: {
              p_cover_key: string;
              p_job_id: string;
              p_lease_token: string;
              p_provider: string;
            };
            Returns: string;
          };
      complete_onboarding_v1: {
        Args: { p_display_name: string; p_username: string };
        Returns: undefined;
      };
      complete_onboarding_v2: {
        Args: { p_display_name: string; p_username: string };
        Returns: undefined;
      };
      complete_push_delivery: {
        Args: {
          p_delivery_id: string;
          p_lease_token: string;
          p_ticket_id?: string;
        };
        Returns: boolean;
      };
      create_friend_request: {
        Args: { p_profile_id: string };
        Returns: Database["public"]["Enums"]["friendship_status"];
      };
      create_patch_v2: {
        Args: {
          p_category: Database["public"]["Enums"]["achievement_category"];
          p_description: string;
          p_event_date: string;
          p_lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          p_operation_id: string;
          p_rarity: Database["public"]["Enums"]["achievement_rarity"];
          p_target_date: string;
          p_title: string;
          p_visibility: Database["public"]["Enums"]["achievement_visibility"];
        };
        Returns: {
          achievement_id: string;
          generation_status: Database["public"]["Enums"]["achievement_status"];
          job_id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          was_existing: boolean;
        }[];
      };
      disable_push_device: {
        Args: { p_expo_push_token: string };
        Returns: undefined;
      };
      disable_push_installation: {
        Args: { p_installation_id: string };
        Returns: undefined;
      };
      fail_achievement_generation_job:
        | {
            Args: {
              p_job_id: string;
              p_lease_token: string;
              p_message: string;
              p_retryable?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              p_job_id: string;
              p_message: string;
              p_retryable?: boolean;
            };
            Returns: string;
          };
      fail_push_delivery: {
        Args: {
          p_delivery_id: string;
          p_error_code: string;
          p_error_message: string;
          p_lease_token: string;
          p_retryable?: boolean;
        };
        Returns: boolean;
      };
      get_background_job_health_v1: {
        Args: never;
        Returns: {
          failed_count: number;
          queue: string;
          queued_count: number;
          running_count: number;
          stale_lease_count: number;
        }[];
      };
      get_blocked_users_v2: {
        Args: never;
        Returns: {
          avatar_key: string;
          blocked_at: string;
          display_name: string;
          id: string;
          username: string;
        }[];
      };
      get_collection_v2: {
        Args: {
          p_category?: Database["public"]["Enums"]["achievement_category"];
          p_include_hidden?: boolean;
          p_lifecycle?: Database["public"]["Enums"]["patch_lifecycle_status"];
          p_limit?: number;
          p_query?: string;
          p_sort?: string;
        };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at: string;
          completed_at: string;
          cover_key: string;
          cover_url: string;
          created_at: string;
          description: string;
          hidden_at: string;
          id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string;
          revoked_at: string;
          source_key: string;
          source_kind: Database["public"]["Enums"]["achievement_source_kind"];
          status: Database["public"]["Enums"]["achievement_status"];
          target_date: string;
          title: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        }[];
      };
      get_collection_v3: {
        Args: {
          p_before_created_at?: string;
          p_before_id?: string;
          p_before_rarity_rank?: number;
          p_before_title?: string;
          p_category?: Database["public"]["Enums"]["achievement_category"];
          p_hidden_only?: boolean;
          p_include_hidden?: boolean;
          p_lifecycle?: Database["public"]["Enums"]["patch_lifecycle_status"];
          p_limit?: number;
          p_query?: string;
          p_sort?: string;
        };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at: string;
          completed_at: string;
          cover_key: string;
          cover_url: string;
          created_at: string;
          description: string;
          hidden_at: string;
          id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string;
          revoked_at: string;
          source_key: string;
          source_kind: Database["public"]["Enums"]["achievement_source_kind"];
          status: Database["public"]["Enums"]["achievement_status"];
          target_date: string;
          title: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        }[];
      };
      get_current_profile_summary: {
        Args: never;
        Returns: {
          achievement_count: number;
          avatar_key: string;
          bio: string;
          display_name: string;
          friend_count: number;
          id: string;
          is_discoverable: boolean;
          map_is_public: boolean;
          onboarding_completed: boolean;
          owner_achievement_count: number;
          owner_total_received_likes: number;
          time_zone: string;
          total_received_likes: number;
          username: string;
        }[];
      };
      get_discover_feed_v2: {
        Args: { p_limit?: number };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          completed_at: string;
          cover_key: string;
          cover_url: string;
          created_at: string;
          description: string;
          id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          owner_avatar_key: string;
          owner_display_name: string;
          owner_id: string;
          owner_username: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string;
          status: Database["public"]["Enums"]["achievement_status"];
          title: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        }[];
      };
      get_discover_feed_v3: {
        Args: { p_limit?: number; p_offset?: number };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          completed_at: string;
          cover_key: string;
          cover_url: string;
          created_at: string;
          description: string;
          id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          owner_avatar_key: string;
          owner_display_name: string;
          owner_id: string;
          owner_username: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string;
          status: Database["public"]["Enums"]["achievement_status"];
          title: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        }[];
      };
      get_discover_feed_v4: {
        Args: { p_after_rank?: number; p_limit?: number; p_round_id?: string };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          completed_at: string;
          cover_key: string;
          cover_url: string;
          created_at: string;
          description: string;
          id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          owner_avatar_key: string;
          owner_display_name: string;
          owner_id: string;
          owner_username: string;
          rank: number;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string;
          round_id: string;
          status: Database["public"]["Enums"]["achievement_status"];
          title: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        }[];
      };
      get_friend_feed_v2: {
        Args: { p_limit?: number };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          cover_key: string;
          cover_url: string;
          created_at: string;
          description: string;
          id: string;
          like_count: number;
          owner_avatar_key: string;
          owner_display_name: string;
          owner_id: string;
          owner_username: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          title: string;
        }[];
      };
      get_friends_v2: {
        Args: { p_view?: string };
        Returns: {
          avatar_key: string;
          bio: string;
          display_name: string;
          friend_count: number;
          profile_id: string;
          relationship: string;
          requested_at: string;
          username: string;
        }[];
      };
      get_friendship_state: { Args: { p_profile_id: string }; Returns: string };
      get_hidden_collection_v2: {
        Args: {
          p_category?: Database["public"]["Enums"]["achievement_category"];
          p_lifecycle?: Database["public"]["Enums"]["patch_lifecycle_status"];
          p_limit?: number;
          p_query?: string;
          p_sort?: string;
        };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at: string;
          completed_at: string;
          cover_key: string;
          cover_url: string;
          created_at: string;
          description: string;
          hidden_at: string;
          id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string;
          revoked_at: string;
          source_key: string;
          source_kind: Database["public"]["Enums"]["achievement_source_kind"];
          status: Database["public"]["Enums"]["achievement_status"];
          target_date: string;
          title: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        }[];
      };
      get_public_profile_map: {
        Args: { p_profile_id: string };
        Returns: {
          country_code: string;
          country_name: string;
          status: Database["public"]["Enums"]["country_visit_status"];
        }[];
      };
      get_runtime_feature_flags_v1: {
        Args: never;
        Returns: {
          enabled: boolean;
          key: string;
        }[];
      };
      heartbeat_achievement_generation_job: {
        Args: {
          p_job_id: string;
          p_lease_seconds?: number;
          p_lease_token: string;
        };
        Returns: boolean;
      };
      mark_discover_swipe_guide_seen_v1: {
        Args: { p_operation_id: string };
        Returns: string;
      };
      mark_patch_collection_viewed: {
        Args: { p_patch_id: string };
        Returns: {
          collection_viewed_at: string;
          id: string;
        }[];
      };
      mark_patch_reveal_viewed: {
        Args: { p_patch_id: string };
        Returns: undefined;
      };
      reclaim_expired_push_deliveries: { Args: never; Returns: number };
      record_discover_engagement_v1: {
        Args: {
          p_achievement_id: string;
          p_duration_ms?: number;
          p_event_type: string;
          p_operation_id?: string;
        };
        Returns: undefined;
      };
      record_feed_action: {
        Args: {
          p_achievement_id: string;
          p_action: Database["public"]["Enums"]["feed_action_type"];
        };
        Returns: undefined;
      };
      record_product_analytics_event_v1: {
        Args: {
          p_event_name: string;
          p_operation_id?: string;
          p_source?: string;
          p_subject_id?: string;
        };
        Returns: undefined;
      };
      register_push_device:
        | {
            Args: { p_expo_push_token: string; p_platform: string };
            Returns: string;
          }
        | {
            Args: {
              p_expo_push_token: string;
              p_installation_id: string;
              p_platform: string;
            };
            Returns: string;
          };
      remove_country_visit_v2: {
        Args: { p_country_code: string; p_operation_id: string };
        Returns: undefined;
      };
      remove_friend: { Args: { p_profile_id: string }; Returns: undefined };
      report_content: {
        Args: {
          p_achievement_id: string;
          p_detail?: string;
          p_reason: Database["public"]["Enums"]["report_reason"];
          p_reported_user_id: string;
        };
        Returns: string;
      };
      reset_discover_round: { Args: never; Returns: undefined };
      respond_to_friend_request: {
        Args: { p_accept: boolean; p_requester_id: string };
        Returns: Database["public"]["Enums"]["friendship_status"];
      };
      retry_achievement_generation: {
        Args: { p_achievement_id: string };
        Returns: string;
      };
      search_profiles: {
        Args: { p_limit?: number; p_query: string };
        Returns: {
          avatar_key: string;
          bio: string;
          display_name: string;
          friend_count: number;
          id: string;
          relationship: string;
          username: string;
        }[];
      };
      set_country_visit: {
        Args: {
          p_country_code: string;
          p_country_name: string;
          p_note?: string;
          p_status: Database["public"]["Enums"]["country_visit_status"];
          p_visit_month?: number;
          p_visit_year?: number;
        };
        Returns: {
          unlocked_achievement_ids: string[];
        }[];
      };
      set_country_visit_v2: {
        Args: {
          p_country_code: string;
          p_country_name: string;
          p_note?: string;
          p_operation_id?: string;
          p_status: Database["public"]["Enums"]["country_visit_status"];
          p_visit_month?: number;
          p_visit_year?: number;
        };
        Returns: {
          active_patch_ids: string[];
        }[];
      };
      set_patch_hidden: {
        Args: { p_hidden: boolean; p_operation_id: string; p_patch_id: string };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at: string | null;
          completed_at: string | null;
          cover_key: string | null;
          cover_url: string | null;
          created_at: string;
          date_overridden: boolean;
          description: string;
          description_overridden: boolean;
          failure_reason: string | null;
          hidden_at: string | null;
          id: string;
          idempotency_key: string;
          image_provider: string | null;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string | null;
          revoked_at: string | null;
          search_document: unknown;
          source_key: string | null;
          source_kind: Database["public"]["Enums"]["achievement_source_kind"];
          status: Database["public"]["Enums"]["achievement_status"];
          tags: string[];
          target_date: string | null;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "achievements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_patch_lifecycle: {
        Args: {
          p_confirm_generation_revert?: boolean;
          p_event_date: string;
          p_note: string;
          p_operation_id: string;
          p_patch_id: string;
          p_status: Database["public"]["Enums"]["patch_lifecycle_status"];
        };
        Returns: {
          achievement_id: string;
          generation_status: Database["public"]["Enums"]["achievement_status"];
          job_id: string;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
        }[];
      };
      set_user_time_zone: { Args: { p_time_zone: string }; Returns: string };
      toggle_achievement_like: {
        Args: { p_achievement_id: string; p_liked: boolean };
        Returns: {
          like_count: number;
          liked: boolean;
        }[];
      };
      unblock_user: { Args: { p_user_id: string }; Returns: undefined };
      undo_discover_feedback_v2: {
        Args: { p_achievement_id: string; p_operation_id: string };
        Returns: {
          category_score: number;
          like_count: number;
          liked: boolean;
        }[];
      };
      undo_feed_action: {
        Args: { p_achievement_id: string; p_operation_id: string };
        Returns: {
          like_count: number;
          liked: boolean;
        }[];
      };
      update_patch_event: {
        Args: {
          p_event_date: string;
          p_event_id: string;
          p_note: string;
          p_operation_id: string;
          p_title: string;
          p_unit: string;
          p_value: number;
        };
        Returns: {
          achievement_id: string;
          created_at: string;
          event_date: string;
          id: string;
          kind: Database["public"]["Enums"]["achievement_event_kind"];
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          note: string | null;
          operation_id: string;
          owner_id: string;
          title: string | null;
          unit: string | null;
          updated_at: string;
          value: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "achievement_events";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_system_travel_patch: {
        Args: {
          p_date: string;
          p_description: string;
          p_operation_id: string;
          p_patch_id: string;
        };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at: string | null;
          completed_at: string | null;
          cover_key: string | null;
          cover_url: string | null;
          created_at: string;
          date_overridden: boolean;
          description: string;
          description_overridden: boolean;
          failure_reason: string | null;
          hidden_at: string | null;
          id: string;
          idempotency_key: string;
          image_provider: string | null;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string | null;
          revoked_at: string | null;
          search_document: unknown;
          source_key: string | null;
          source_kind: Database["public"]["Enums"]["achievement_source_kind"];
          status: Database["public"]["Enums"]["achievement_status"];
          tags: string[];
          target_date: string | null;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "achievements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_user_patch: {
        Args: {
          p_category: Database["public"]["Enums"]["achievement_category"];
          p_description: string;
          p_event_date: string;
          p_operation_id: string;
          p_patch_id: string;
          p_rarity: Database["public"]["Enums"]["achievement_rarity"];
          p_target_date: string;
          p_title: string;
          p_visibility: Database["public"]["Enums"]["achievement_visibility"];
        };
        Returns: {
          achievement_date: string;
          category: Database["public"]["Enums"]["achievement_category"];
          collection_viewed_at: string | null;
          completed_at: string | null;
          cover_key: string | null;
          cover_url: string | null;
          created_at: string;
          date_overridden: boolean;
          description: string;
          description_overridden: boolean;
          failure_reason: string | null;
          hidden_at: string | null;
          id: string;
          idempotency_key: string;
          image_provider: string | null;
          lifecycle_status: Database["public"]["Enums"]["patch_lifecycle_status"];
          like_count: number;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          owner_id: string;
          rarity: Database["public"]["Enums"]["achievement_rarity"];
          reveal_viewed_at: string | null;
          revoked_at: string | null;
          search_document: unknown;
          source_key: string | null;
          source_kind: Database["public"]["Enums"]["achievement_source_kind"];
          status: Database["public"]["Enums"]["achievement_status"];
          tags: string[];
          target_date: string | null;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["achievement_visibility"];
        };
        SetofOptions: {
          from: "*";
          to: "achievements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      achievement_category:
        | "adventure"
        | "travel"
        | "personal"
        | "social"
        | "creativity"
        | "learning"
        | "health"
        | "work"
        | "everyday"
        | "funny"
        | "other";
      achievement_event_kind: "created" | "progress" | "completed" | "note";
      achievement_rarity: "common" | "rare" | "legendary";
      achievement_source_kind:
        "user" | "country" | "country_milestone" | "continent";
      achievement_status: "draft" | "processing" | "completed" | "failed";
      achievement_visibility: "public" | "private";
      country_visit_status: "visited" | "lived" | "wishlist";
      feed_action_type: "skip" | "like" | "dislike";
      friendship_status: "pending" | "accepted";
      generation_job_status: "queued" | "running" | "completed" | "failed";
      moderation_status: "active" | "under_review" | "hidden" | "removed";
      notification_type:
        | "achievement_completed"
        | "achievement_failed"
        | "achievement_liked"
        | "friend_request"
        | "friend_accepted";
      patch_lifecycle_status: "locked" | "in_progress" | "completed";
      push_delivery_status:
        "queued" | "running" | "sent" | "failed" | "disabled";
      recommendation_action: "like" | "not_for_me" | "skip";
      report_reason:
        | "spam"
        | "harassment"
        | "hate"
        | "sexual_content"
        | "self_harm"
        | "other";
      theme_preference: "system" | "light" | "dark";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      achievement_category: [
        "adventure",
        "travel",
        "personal",
        "social",
        "creativity",
        "learning",
        "health",
        "work",
        "everyday",
        "funny",
        "other",
      ],
      achievement_event_kind: ["created", "progress", "completed", "note"],
      achievement_rarity: ["common", "rare", "legendary"],
      achievement_source_kind: [
        "user",
        "country",
        "country_milestone",
        "continent",
      ],
      achievement_status: ["draft", "processing", "completed", "failed"],
      achievement_visibility: ["public", "private"],
      country_visit_status: ["visited", "lived", "wishlist"],
      feed_action_type: ["skip", "like", "dislike"],
      friendship_status: ["pending", "accepted"],
      generation_job_status: ["queued", "running", "completed", "failed"],
      moderation_status: ["active", "under_review", "hidden", "removed"],
      notification_type: [
        "achievement_completed",
        "achievement_failed",
        "achievement_liked",
        "friend_request",
        "friend_accepted",
      ],
      patch_lifecycle_status: ["locked", "in_progress", "completed"],
      push_delivery_status: ["queued", "running", "sent", "failed", "disabled"],
      recommendation_action: ["like", "not_for_me", "skip"],
      report_reason: [
        "spam",
        "harassment",
        "hate",
        "sexual_content",
        "self_harm",
        "other",
      ],
      theme_preference: ["system", "light", "dark"],
    },
  },
} as const;
