"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarAdmin, type UsuarioAdmin } from "./sidebar-admin";

export interface ShellAdminProps {
  usuario: UsuarioAdmin;
  children: ReactNode;
}

/**
 * Casca do painel admin: sidebar fixa de 280px no desktop (o design pedia 240, mas cortava
 * "Assistente do professor" + selo; 280 = largura da gaveta); no celular, topbar de 56px
 * que abre a mesma navegação numa gaveta (foco preso, ESC e clique fora fecham).
 */
export function ShellAdmin({ usuario, children }: ShellAdminProps) {
  const [gaveta, setGaveta] = useState(false);
  const busca = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl K foca a busca da sidebar (no celular a sidebar está na gaveta fechada: não faz nada).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && busca.current) {
        e.preventDefault();
        busca.current.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] desk:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="scrollbar-oculta sticky top-0 hidden h-dvh overflow-y-auto border-r border-border bg-surface desk:block">
        <SidebarAdmin usuario={usuario} refBusca={busca} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <Dialog.Root open={gaveta} onOpenChange={setGaveta}>
          <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 desk:hidden">
            <Dialog.Trigger render={<Button variant="fantasma" size="icone44" aria-label="Abrir menu" className="-ml-2" />}>
              <Menu aria-hidden />
            </Dialog.Trigger>
            <span className="text-[13px] font-extrabold">Admin</span>
            <div className="flex-1" />
            <Avatar nome={usuario.nome} tamanho={30} tom="accent" />
          </div>

          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/55 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 desk:hidden" />
            <Dialog.Popup className="scrollbar-oculta fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] overflow-y-auto border-r border-border bg-surface duration-150 outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left desk:hidden">
              <Dialog.Title className="sr-only">Menu do admin</Dialog.Title>
              <SidebarAdmin
                usuario={usuario}
                aoNavegar={() => setGaveta(false)}
                fechar={
                  <Dialog.Close render={<Button variant="fantasma" size="icone44" aria-label="Fechar menu" className="-my-2 -mr-2" />}>
                    <X aria-hidden />
                  </Dialog.Close>
                }
              />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>

        <main className="flex min-w-0 flex-col gap-5 px-5 py-6 desk:px-10 desk:py-11">{children}</main>
      </div>
    </div>
  );
}
