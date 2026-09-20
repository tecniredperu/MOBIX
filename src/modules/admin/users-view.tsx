"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { KeyRound, Plus, Save, ShieldCheck, Users, X } from "lucide-react";
import {
  createUserAction,
  resetUserPasswordAction,
  updateUserAction,
} from "./admin-actions";

export function UsersAdminView({
  users,
  roles,
  branches,
}: {
  users: any[];
  roles: any[];
  branches: any[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    roleId: roles[0]?.id || "",
    branchId: branches[0]?.id || "",
  });

  function create() {
    setError("");
    start(async () => {
      try {
        await createUserAction(form);
        setShowNew(false);
        setForm({
          name: "",
          email: "",
          phone: "",
          password: "",
          roleId: roles[0]?.id || "",
          branchId: branches[0]?.id || "",
        });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo crear el usuario.");
      }
    });
  }

  function save(user: any, roleId: string, branchId: string, status: string, userStatus: string) {
    setError("");
    start(async () => {
      try {
        await updateUserAction({
          membershipId: user.membershipId,
          roleId,
          branchId: branchId || undefined,
          membershipStatus: status as "ACTIVE" | "SUSPENDED" | "INACTIVE",
          userStatus: userStatus as "ACTIVE" | "SUSPENDED" | "INACTIVE",
        });
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo actualizar el usuario.");
      }
    });
  }

  function resetPassword(user: any, newPassword: string, onDone: () => void) {
    setError("");
    start(async () => {
      try {
        await resetUserPasswordAction({
          membershipId: user.membershipId,
          newPassword,
        });
        onDone();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo restablecer la contraseña.");
      }
    });
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Usuarios</h1>
          <p>Personal de la empresa, rol asignado, sucursal predeterminada y estado de acceso.</p>
        </div>
        <div className="admin-heading-actions">
          <Link className="secondary-button" href="/administracion/roles">
            <ShieldCheck size={16} /> Roles y permisos
          </Link>
          <button className="primary-button" onClick={() => setShowNew((value) => !value)}>
            <Plus size={16} /> Nuevo usuario
          </button>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <strong>No se pudo completar</strong>
          <span>{error}</span>
        </div>
      )}

      {showNew && (
        <section className="panel admin-create-card">
          <div className="section-title">
            <div>
              <h2>Crear usuario</h2>
              <p>La contraseña se almacena de forma segura y puede restablecerse desde este panel.</p>
            </div>
            <KeyRound size={19} />
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Nombre completo</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              <span>Correo</span>
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label>
              <span>Celular</span>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label>
              <span>Contraseña inicial</span>
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            </label>
            <label>
              <span>Rol</span>
              <select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>
                {roles.filter((role) => role.status === "ACTIVE").map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sucursal predeterminada</span>
              <select value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}>
                <option value="">Sin sucursal</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          </div>
          <button className="primary-button" disabled={pending} onClick={create}>
            {pending ? "Creando..." : "Crear usuario"}
          </button>
        </section>
      )}

      <section className="mobix-summary-grid four">
        <article><Users size={19} /><span>Usuarios</span><strong>{users.length}</strong></article>
        <article><span className="summary-symbol">✓</span><span>Activos</span><strong>{users.filter((user) => user.status === "ACTIVE" && user.userStatus === "ACTIVE").length}</strong></article>
        <article><ShieldCheck size={19} /><span>Roles</span><strong>{roles.length}</strong></article>
        <article><span className="summary-symbol">#</span><span>Sucursales</span><strong>{branches.length}</strong></article>
      </section>

      <section className="panel table-panel">
        <div className="table-wrap">
          <table className="data-table admin-users-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Sucursal</th>
                <th>Membresía</th>
                <th>Usuario</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.membershipId}
                  user={user}
                  roles={roles}
                  branches={branches}
                  pending={pending}
                  onSave={save}
                  onResetPassword={resetPassword}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function UserRow({
  user,
  roles,
  branches,
  pending,
  onSave,
  onResetPassword,
}: {
  user: any;
  roles: any[];
  branches: any[];
  pending: boolean;
  onSave: (user: any, roleId: string, branchId: string, status: string, userStatus: string) => void;
  onResetPassword: (user: any, newPassword: string, onDone: () => void) => void;
}) {
  const [role, setRole] = useState(user.roleId);
  const [branch, setBranch] = useState(user.branchId || "");
  const [status, setStatus] = useState(user.status);
  const [userStatus, setUserStatus] = useState(user.userStatus);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  return (
    <tr>
      <td>
        <div className="stacked-cell">
          <strong>{user.name}</strong>
          <span>{user.email}{user.phone ? ` · ${user.phone}` : ""}</span>
        </div>
      </td>
      <td>
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          {roles.filter((item) => item.status === "ACTIVE" || item.id === role).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </td>
      <td>
        <select value={branch} onChange={(event) => setBranch(event.target.value)}>
          <option value="">Sin sucursal</option>
          {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </td>
      <td>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ACTIVE">Activo</option>
          <option value="SUSPENDED">Suspendido</option>
          <option value="INACTIVE">Inactivo</option>
        </select>
      </td>
      <td>
        <select value={userStatus} onChange={(event) => setUserStatus(event.target.value)}>
          <option value="ACTIVE">Activo</option>
          <option value="SUSPENDED">Suspendido</option>
          <option value="INACTIVE">Inactivo</option>
        </select>
      </td>
      <td>
        <div className="stacked-cell">
          <button
            className="table-action-link"
            disabled={pending}
            onClick={() => onSave(user, role, branch, status, userStatus)}
          >
            <Save size={14} /> Guardar
          </button>

          {!resetOpen ? (
            <button className="table-action-link" disabled={pending} onClick={() => setResetOpen(true)}>
              <KeyRound size={14} /> Cambiar clave
            </button>
          ) : (
            <>
              <input
                type="password"
                value={newPassword}
                placeholder="Nueva contraseña"
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <button
                className="table-action-link"
                disabled={pending || !newPassword}
                onClick={() => onResetPassword(user, newPassword, () => {
                  setNewPassword("");
                  setResetOpen(false);
                })}
              >
                <KeyRound size={14} /> Aplicar
              </button>
              <button
                className="table-action-link"
                disabled={pending}
                onClick={() => {
                  setNewPassword("");
                  setResetOpen(false);
                }}
              >
                <X size={14} /> Cancelar
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
