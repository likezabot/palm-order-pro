/**
 * Dados fictícios usados no preview ao vivo da página /configuracoes/impressora.
 */
import type { BuildLayoutInput } from "@/lib/receipt-layout";

export type PreviewKind = "mesa" | "balcao" | "delivery" | "acrescimo";

const NOW_ID = "test-preview-0001";

export const PREVIEW_INPUTS: Record<PreviewKind, BuildLayoutInput> = {
  mesa: {
    docType: "PEDIDO",
    tableName: "Mesa 5",
    waiterName: "João",
    orderId: NOW_ID,
    orderShortId: "10",
    serviceType: "dine_in",
    items: [
      { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
      { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.0 },
      { product_name: "Cerveja Original", quantity: 2, product_price: 14.0, note: "Bem gelada" },
    ],
    total: 66.0,
  },
  balcao: {
    docType: "SENHA",
    senha: "042",
    customerName: "Maria",
    orderId: NOW_ID,
    orderShortId: "042",
    serviceType: "pickup",
    items: [
      { product_name: "Espeto Frango", quantity: 1, product_price: 12.0 },
      { product_name: "Suco Natural", quantity: 1, product_price: 16.0, note: "Sem açúcar" },
    ],
    total: 28.0,
    paymentMethod: "pix",
  },
  delivery: {
    docType: "DELIVERY",
    customerName: "Pedro",
    customerPhone: "(11) 98888-1234",
    orderId: NOW_ID,
    orderShortId: "55",
    serviceType: "delivery",
    items: [
      { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0 },
      { product_name: "Refrigerante Lata", quantity: 1, product_price: 10.0 },
    ],
    deliveryAddress: {
      street: "Rua das Flores",
      number: "123",
      neighborhood: "Centro",
      complement: "Apto 42",
      reference: "Próximo à padaria",
    },
    deliveryFee: 5.0,
    subtotal: 40.0,
    total: 45.0,
    paymentMethod: "cash",
    changeFor: 50.0,
  },
  acrescimo: {
    docType: "ACRESCIMO",
    tableName: "Mesa 5",
    orderId: NOW_ID,
    orderShortId: "10",
    serviceType: "dine_in",
    items: [
      { product_name: "Cerveja Original", quantity: 1, product_price: 12.0 },
    ],
    total: 12.0,
  },
};
