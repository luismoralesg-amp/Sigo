import com.healthmarketscience.jackcess.ColumnBuilder;
import com.healthmarketscience.jackcess.DataType;
import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Table;
import com.healthmarketscience.jackcess.TableBuilder;
import java.io.File;

/** Genera un .mdb de prueba con datos INVENTADOS. No es un paciente real. */
public class CrearMdb {
  static ColumnBuilder col(String nombre) {
    return new ColumnBuilder(nombre).setType(DataType.TEXT).setLength(255);
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      System.err.println("uso: CrearMdb <salida.mdb>");
      System.exit(2);
    }
    File f = new File(args[0]);
    if (f.exists() && !f.delete()) {
      throw new IllegalStateException("no se pudo borrar " + f);
    }
    Database db = DatabaseBuilder.create(Database.FileFormat.V2000, f);
    Table deptos = new TableBuilder("departamentos")
        .addColumn(col("codigo"))
        .addColumn(col("nombre"))
        .toTable(db);
    deptos.addRow("09", "Quetzaltenango");
    deptos.addRow("08", "Totonicapan");

    Table t = new TableBuilder("pacientes")
        .addColumn(col("Nombre"))
        .addColumn(col("Apellidos"))
        .addColumn(col("CUI"))
        .addColumn(col("Fecha nac"))
        .addColumn(col("Sexo"))
        .addColumn(col("Aldea"))
        .addColumn(col("Alergias"))
        .addColumn(col("Enfermedades cronicas"))
        .addColumn(col("Fecha atencion"))
        .addColumn(col("Motivo de consulta"))
        .addColumn(col("Diagnostico"))
        .addColumn(col("Medicamentos"))
        .addColumn(col("Vacunas"))
        .toTable(db);

    t.addRow("Marta Elena", "Choc Ixcoy", "2468-1000-90901", "22/05/1978", "Femenino",
        "Paraje Los Pinos", "ibuprofeno", "hipertension", "15/03/2024",
        "Control de presion", "Hipertension arterial", "Losartan 50 mg", "Td");
    t.addRow("Jose Tomas", "Guarcax Sicajau", "2468100170901", "03-11-1991", "M",
        "Canton La Esperanza", "Ninguna", "", "2019-07-08",
        "Dolor de oido", "Otitis media", "Amoxicilina", "");
    t.addRow("Lucia Beatriz", "Morales Pac", "", "12/08/2018", "F",
        "Canton La Esperanza", "Ninguna", "", "",
        "Control nino sano", "", "", "");
    t.addRow("", "", "", "", "", "", "", "", "", "", "", "", "");
    t.addRow("Pedro Antonio", "Sacal Xiloj", "246 810 033 0901", "13/04/1985", "Masculino",
        "Paraje Los Pinos", "", "diabetes", "04/13/2023",
        "Control", "Diabetes mellitus tipo 2", "Metformina", "Influenza");
    db.close();
    System.out.println("ok " + f.getAbsolutePath() + " " + f.length());
  }
}
