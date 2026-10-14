import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Botao do design system (medidas do prototipo v3). Para link com cara de botao
 * use `buttonVariants()` no className do `<Link>`.
 * Os nomes `variant`/`size` ficam em ingles para os componentes do shadcn
 * (alert-dialog e os proximos `shadcn add`) continuarem compilando; os VALORES
 * sao em PT. `default/outline/ghost/destructive/secondary` sao apelidos.
 */
const variantesBase = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 border border-transparent font-sans whitespace-nowrap select-none transition-[background-color,border-color,color,transform] duration-150 active:not-disabled:scale-[.98] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primario: "bg-accent font-bold text-accent-ink hover:bg-accent/88",
        secundario: "border-border bg-surface font-semibold text-text hover:bg-surface-2",
        contorno: "border-border bg-transparent font-semibold text-text hover:bg-surface-2",
        fantasma: "bg-transparent font-semibold text-text hover:bg-surface-2",
        perigo: "border-border bg-transparent font-bold text-warn hover:border-warn hover:bg-warn-soft",
        link: "bg-transparent font-semibold text-accent underline-offset-4 hover:underline",
        heroPrimario: "rounded-full bg-fixo-accent font-bold text-fixo-accent-ink hover:bg-fixo-accent/88",
        heroSecundario:
          "rounded-full bg-fixo-vidro font-bold text-fixo-text backdrop-blur-[6px] hover:bg-fixo-vidro-forte",
        // Apelidos do shadcn (alert-dialog e modal-confirmacao-block usam):
        default: "bg-accent font-bold text-accent-ink hover:bg-accent/88",
        outline: "border-border bg-transparent font-semibold text-text hover:bg-surface-2",
        secondary: "border-border bg-surface font-semibold text-text hover:bg-surface-2",
        ghost: "bg-transparent font-semibold text-text hover:bg-surface-2",
        destructive: "border-border bg-transparent font-bold text-warn hover:border-warn hover:bg-warn-soft",
      },
      size: {
        "36": "h-9 rounded-md px-3.5 text-[13px]",
        "40": "h-10 rounded-[9px] px-4 text-[13px]",
        "42": "h-[42px] rounded-[9px] px-5 text-sm",
        "46": "h-[46px] rounded-[9px] px-4 text-[13px]",
        "48": "h-12 rounded-full px-6 text-base [&_svg:not([class*='size-'])]:size-5",
        "50": "h-[50px] rounded-lg px-6 text-[15px]",
        icone36: "size-9 rounded-md",
        icone44: "size-11 rounded-lg [&_svg:not([class*='size-'])]:size-[22px]",
        // Apelidos do shadcn:
        default: "h-10 rounded-[9px] px-4 text-[13px]",
        sm: "h-9 rounded-md px-3.5 text-[13px]",
        lg: "h-[42px] rounded-[9px] px-5 text-sm",
        icon: "size-9 rounded-md",
      },
      pilula: { true: "rounded-full", false: "" },
      larguraTotal: { true: "w-full", false: "" },
    },
    compoundVariants: [
      { variant: "link", class: "h-auto px-0" },
      { variant: ["heroPrimario", "heroSecundario"], class: "rounded-full" },
    ],
    defaultVariants: { variant: "primario", size: "40", pilula: false, larguraTotal: false },
  }
)

/** Classes do botao ja com conflitos resolvidos (use em <Link className={buttonVariants(...)}>). */
function buttonVariants({
  className,
  ...variantes
}: VariantProps<typeof variantesBase> & { className?: string } = {}) {
  return cn(variantesBase(variantes), className)
}

type ButtonProps = Omit<ButtonPrimitive.Props, "className"> &
  VariantProps<typeof variantesBase> & {
    className?: string
    /** Mostra o spinner, trava o clique e marca `aria-busy`. */
    carregando?: boolean
  }

function Button({
  className,
  variant,
  size,
  pilula,
  larguraTotal,
  carregando = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, pilula, larguraTotal, className })}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      {...props}
    >
      {carregando && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants, type ButtonProps }
