import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../src/lib/supabaseAdmin.js";
import {
  clearAuthProfileCacheForUser,
  requireAuthenticatedProfile,
} from "./_lib/auth.js";
const EXCLUDED_DASHBOARD_DEPARTMENTS = new Set(["管理部"]);
const isValidPassword = (password: string) =>
  password.length >= 8 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[^A-Za-z0-9]/.test(password);
const getPasswordResetRedirectUrl = (req: VercelRequest) => {
  const appUrl =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ??
    "";
  const requestOrigin = String(req.headers.origin ?? "").trim();
  const redirectOrigin = requestOrigin.startsWith("http://localhost:")
    ? requestOrigin
    : appUrl;
  return `${redirectOrigin || "https://mystarz-crm.vercel.app"}/reset-password`;
};

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse,
) {
  try {
    const isRecordLoginRequest =
      _req.method === "POST" &&
      String((_req.body as any)?.action ?? "").trim() === "record-login";
    const profile = await requireAuthenticatedProfile(_req, res, {
      allowMfaIncomplete: isRecordLoginRequest,
    });
    if (!profile) return;

    const action = String(
      (_req.body as any)?.action ?? _req.query?.action ?? "",
    ).trim();

    if (action === "master") {
      if (!profile.can_manage_users) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (_req.method === "GET") {
        const [
          { data: profiles, error: profilesError },
          authUsersResult,
          staffResult,
          mapsResult,
        ] = await Promise.all([
          supabaseAdmin
            .from("profiles")
            .select(
              "id, name, email, role, department_id, is_salesperson, can_view_dashboard, can_manage_users, departments(name)",
            )
            .order("name", { ascending: true }),
          supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          supabaseAdmin
            .from("external_staffs")
            .select("department_id, code, name, raw_label")
            .order("code"),
          supabaseAdmin
            .from("profile_external_staff_maps")
            .select(
              "profile_id, department_id, external_staff_code, is_primary",
            ),
        ]);

        if (
          profilesError ||
          authUsersResult.error ||
          staffResult.error ||
          mapsResult.error
        ) {
          console.error(
            "users master fetch error:",
            profilesError ?? authUsersResult.error,
          );
          return res.status(500).json({ error: "users master fetch failed" });
        }

        const authUsers = new Map(
          (authUsersResult.data?.users ?? []).map((user) => [user.id, user]),
        );
        const users = (profiles ?? []).map((row: any) => {
          const authUser = authUsers.get(row.id);
          const bannedUntil = authUser?.banned_until ?? null;
          const isSuspended = Boolean(
            bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
          );
          return {
            id: row.id,
            name: row.name ?? "",
            email: row.email ?? authUser?.email ?? "",
            role: row.role ?? "user",
            department_id: row.department_id ?? null,
            department: row.departments?.name ?? "",
            is_salesperson: Boolean(row.is_salesperson),
            external_staff_code:
              (mapsResult.data ?? []).find(
                (map: any) => map.profile_id === row.id && map.is_primary,
              )?.external_staff_code ??
              (mapsResult.data ?? []).find(
                (map: any) => map.profile_id === row.id,
              )?.external_staff_code ??
              "",
            can_view_dashboard: Boolean(row.can_view_dashboard),
            can_manage_users: Boolean(row.can_manage_users),
            is_suspended: isSuspended,
            created_at: authUser?.created_at ?? null,
          };
        });

        return res
          .status(200)
          .json({ users, external_staffs: staffResult.data ?? [] });
      }

      if (_req.method === "POST") {
        const email = String((_req.body as any)?.email ?? "")
          .trim()
          .toLowerCase();
        const name = String((_req.body as any)?.name ?? "").trim();
        const departmentId = Number((_req.body as any)?.department_id);
        const role = String((_req.body as any)?.role ?? "user").trim();
        const canViewDashboard = Boolean(
          (_req.body as any)?.can_view_dashboard,
        );
        const canManageUsers = Boolean((_req.body as any)?.can_manage_users);
        const isSalesperson = Boolean((_req.body as any)?.is_salesperson);
        const externalStaffCode = String(
          (_req.body as any)?.external_staff_code ?? "",
        ).trim();

        if (!email || !name || !Number.isInteger(departmentId)) {
          return res
            .status(400)
            .json({ error: "氏名、メールアドレス、部署は必須です" });
        }
        if (!["admin", "user"].includes(role)) {
          return res.status(400).json({ error: "Invalid role" });
        }

        const { data: department, error: departmentError } = await supabaseAdmin
          .from("departments")
          .select("id")
          .eq("id", departmentId)
          .maybeSingle();
        if (departmentError || !department) {
          return res
            .status(400)
            .json({ error: "有効な部署を選択してください" });
        }

        const { data: created, error: createError } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { name, department_id: departmentId, role },
            redirectTo: getPasswordResetRedirectUrl(_req),
          });
        if (createError || !created.user) {
          console.error("users master create auth error:", createError);
          return res
            .status(400)
            .json({
              error: createError?.message ?? "アカウントを追加できませんでした",
            });
        }

        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              id: created.user.id,
              name,
              email,
              role,
              department_id: departmentId,
              can_view_dashboard: canViewDashboard,
              can_manage_users: canManageUsers,
              is_salesperson: isSalesperson,
              must_change_password: true,
            },
            { onConflict: "id" },
          );
        if (profileError) {
          console.error("users master create profile error:", profileError);
          await supabaseAdmin.auth.admin.deleteUser(created.user.id);
          return res
            .status(500)
            .json({ error: "プロフィールを作成できませんでした" });
        }

        if (isSalesperson && externalStaffCode) {
          const { error: mapError } = await supabaseAdmin
            .from("profile_external_staff_maps")
            .insert({
              profile_id: created.user.id,
              department_id: departmentId,
              external_staff_code: externalStaffCode,
              is_primary: true,
            });
          if (mapError)
            console.error("users master create staff map error:", mapError);
        }

        return res
          .status(201)
          .json({
            ok: true,
            id: created.user.id,
            email,
            invitation_sent: true,
          });
      }

      if (_req.method === "PATCH") {
        const userId = String((_req.body as any)?.user_id ?? "").trim();
        const operation = String(
          (_req.body as any)?.operation ?? "set-suspended",
        ).trim();
        if (!userId)
          return res.status(400).json({ error: "user_id is required" });

        if (operation === "reset-password") {
          const password = String((_req.body as any)?.password ?? "");
          if (!isValidPassword(password))
            return res
              .status(400)
              .json({
                error:
                  "パスワードは8文字以上で、英大文字・英小文字・記号を含めてください",
              });
          const { error: passwordError } =
            await supabaseAdmin.auth.admin.updateUserById(userId, { password });
          if (passwordError)
            return res.status(400).json({ error: passwordError.message });
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .update({ must_change_password: true })
            .eq("id", userId);
          if (profileError)
            return res
              .status(500)
              .json({ error: "次回パスワード変更を設定できませんでした" });
          clearAuthProfileCacheForUser(userId);
          return res.status(200).json({ ok: true });
        }

        if (operation === "send-password-reset-email") {
          const { data: targetUser, error: targetError } =
            await supabaseAdmin.auth.admin.getUserById(userId);
          const email = targetUser.user?.email ?? "";
          if (targetError || !email)
            return res
              .status(400)
              .json({
                error: "対象ユーザーのメールアドレスを取得できませんでした",
              });
          const { error: emailError } =
            await supabaseAdmin.auth.resetPasswordForEmail(email, {
              redirectTo: getPasswordResetRedirectUrl(_req),
            });
          if (emailError)
            return res.status(400).json({ error: emailError.message });
          return res.status(200).json({ ok: true, email });
        }

        if (operation === "update") {
          const email = String((_req.body as any)?.email ?? "")
            .trim()
            .toLowerCase();
          const name = String((_req.body as any)?.name ?? "").trim();
          const departmentId = Number((_req.body as any)?.department_id);
          const role = String((_req.body as any)?.role ?? "user").trim();
          const canViewDashboard = Boolean(
            (_req.body as any)?.can_view_dashboard,
          );
          const canManageUsers = Boolean((_req.body as any)?.can_manage_users);
          const isSalesperson = Boolean((_req.body as any)?.is_salesperson);
          const externalStaffCode = String(
            (_req.body as any)?.external_staff_code ?? "",
          ).trim();

          if (!email || !name || !Number.isInteger(departmentId)) {
            return res
              .status(400)
              .json({ error: "氏名、メールアドレス、部署は必須です" });
          }
          if (!["admin", "user"].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
          }
          if (userId === profile.id && !canManageUsers) {
            return res
              .status(400)
              .json({ error: "自分自身のユーザー管理権限は解除できません" });
          }

          const { data: department, error: departmentError } =
            await supabaseAdmin
              .from("departments")
              .select("id")
              .eq("id", departmentId)
              .maybeSingle();
          if (departmentError || !department) {
            return res
              .status(400)
              .json({ error: "有効な部署を選択してください" });
          }

          const { error: authUpdateError } =
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              email,
              email_confirm: true,
              user_metadata: { name, department_id: departmentId, role },
            });
          if (authUpdateError) {
            console.error("users master auth update error:", authUpdateError);
            return res
              .status(400)
              .json({
                error:
                  authUpdateError.message || "認証情報を更新できませんでした",
              });
          }

          const { error: profileUpdateError } = await supabaseAdmin
            .from("profiles")
            .update({
              name,
              email,
              department_id: departmentId,
              role,
              can_view_dashboard: canViewDashboard,
              can_manage_users: canManageUsers,
              is_salesperson: isSalesperson,
            })
            .eq("id", userId);
          if (profileUpdateError) {
            console.error(
              "users master profile update error:",
              profileUpdateError,
            );
            return res
              .status(500)
              .json({ error: "プロフィールを更新できませんでした" });
          }

          const { error: clearMapError } = await supabaseAdmin
            .from("profile_external_staff_maps")
            .delete()
            .eq("profile_id", userId);
          if (clearMapError)
            return res
              .status(500)
              .json({ error: "いればくん担当者紐付けを更新できませんでした" });
          if (isSalesperson && externalStaffCode) {
            const { error: mapError } = await supabaseAdmin
              .from("profile_external_staff_maps")
              .insert({
                profile_id: userId,
                department_id: departmentId,
                external_staff_code: externalStaffCode,
                is_primary: true,
              });
            if (mapError)
              return res
                .status(500)
                .json({
                  error: "いればくん担当者紐付けを保存できませんでした",
                });
          }

          clearAuthProfileCacheForUser(userId);
          return res.status(200).json({ ok: true });
        }

        if (operation !== "set-suspended") {
          return res.status(400).json({ error: "Unsupported operation" });
        }

        const suspended = Boolean((_req.body as any)?.suspended);
        if (userId === profile.id)
          return res
            .status(400)
            .json({ error: "自分自身のアカウントは停止できません" });

        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          {
            ban_duration: suspended ? "876000h" : "none",
          },
        );
        if (error) {
          console.error("users master suspend error:", error);
          return res
            .status(500)
            .json({
              error: suspended
                ? "アカウントを停止できませんでした"
                : "アカウントを再開できませんでした",
            });
        }
        clearAuthProfileCacheForUser(userId);
        return res.status(200).json({ ok: true });
      }

      if (_req.method === "DELETE") {
        const userId = String((_req.body as any)?.user_id ?? "").trim();
        if (!userId)
          return res.status(400).json({ error: "user_id is required" });
        if (userId === profile.id) {
          return res
            .status(400)
            .json({ error: "自分自身のアカウントは削除できません" });
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) {
          console.error("users master delete error:", error);
          return res
            .status(500)
            .json({ error: "アカウントを削除できませんでした" });
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: "Method not allowed" });
    }

    if (_req.method === "POST") {
      if (action !== "record-login") {
        return res.status(400).json({ error: "Unsupported action" });
      }

      const loggedInAt = new Date().toISOString();

      const { error: insertError } = await supabaseAdmin
        .from("login_events")
        .insert({
          user_id: profile.id,
          logged_in_at: loggedInAt,
        });

      if (insertError) {
        console.error("users api login event insert error:", insertError);
        return res.status(500).json({ error: "login event insert failed" });
      }

      const { data: currentProfile, error: currentProfileError } =
        await supabaseAdmin
          .from("profiles")
          .select("login_count")
          .eq("id", profile.id)
          .single();

      if (currentProfileError) {
        console.error(
          "users api current profile fetch error:",
          currentProfileError,
        );
        return res
          .status(500)
          .json({ error: "profile login count fetch failed" });
      }

      const currentLoginCount = Number(currentProfile?.login_count ?? 0);

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({
          last_login_at: loggedInAt,
          login_count: Number.isFinite(currentLoginCount)
            ? currentLoginCount + 1
            : 1,
        })
        .eq("id", profile.id);

      if (updateError) {
        console.error("users api login profile update error:", updateError);
        return res.status(500).json({ error: "profile login update failed" });
      }

      return res.status(200).json({ ok: true });
    }

    if (_req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, department_id, departments(name)")
      .order("name", { ascending: true });

    if (error) {
      console.error("users api error:", error);
      return res.status(500).json({ error: "users fetch failed" });
    }

    const users = (data ?? [])
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        department_id: row.department_id ?? null,
        department: row.departments?.name ?? "",
      }))
      .filter((row) => !EXCLUDED_DASHBOARD_DEPARTMENTS.has(row.department));

    return res.status(200).json(users);
  } catch (error) {
    console.error("users api unexpected error:", error);
    return res.status(500).json({ error: "users api failed" });
  }
}
