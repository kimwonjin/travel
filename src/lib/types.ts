export type Trip = {
  id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  people: number;
  memo: string;
};

export type Stop = {
  id: string;
  trip_id: string;
  position: number;
  type: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string | null;
};

export type CheckItem = {
  id: string;
  trip_id: string;
  position: number;
  text: string;
  done: boolean;
  category?: string;
};

export type BudgetItem = {
  id: string;
  trip_id: string;
  text: string;
  amount: number;
};
