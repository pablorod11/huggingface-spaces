import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
import pandas as pd
from diagnostics import load_data, calculate_diagnostics, create_static_plot


class DiagnosticsTests(unittest.TestCase):
    def test_synthetic_reproducible(self):
        dates, prices, source = load_data(n=850)
        self.assertEqual(len(dates), 850)
        np.testing.assert_array_equal(prices, load_data(n=850)[1])
        self.assertTrue(source['synthetic'])
        self.assertTrue(np.all(prices > 0))
        with self.assertRaises(ValueError): load_data(n=849)

    def test_upload_validation_and_gaps(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'prices.csv'
            frame = pd.DataFrame({'date': pd.bdate_range('2020-01-01', periods=851).strftime('%Y-%m-%d'), 'close': np.arange(851) + 100.})
            frame.drop(index=100).to_csv(path, index=False)
            dates, prices, source = load_data(path)
            self.assertEqual(len(prices), 850)
            self.assertEqual(source['calendar_gaps']['missing_weekdays'], 1)
            frame.iloc[::-1].to_csv(path, index=False)
            with self.assertRaises(ValueError): load_data(path)
            frame.loc[1, 'date'] = frame.loc[0, 'date']
            frame.to_csv(path, index=False)
            with self.assertRaises(ValueError): load_data(path)

    def test_upload_size_schema_and_positive_prices(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'prices.csv'
            path.write_bytes(b'x' * (2 * 1024 * 1024 + 1))
            with self.assertRaises(ValueError): load_data(path)
            pd.DataFrame({'other': [1]}).to_csv(path, index=False)
            with self.assertRaises(ValueError): load_data(path)
            frame = pd.DataFrame({'date': pd.bdate_range('2020-01-01', periods=850).strftime('%Y-%m-%d'), 'close': np.ones(850)})
            frame.loc[1, 'close'] = 0
            frame.to_csv(path, index=False)
            with self.assertRaises(ValueError): load_data(path)
            frame.loc[1, 'date'] = '2020-01-02'
            frame.loc[1, 'close'] = np.nan
            frame.to_csv(path, index=False)
            with self.assertRaises(ValueError): load_data(path)

    def test_diagnostics_target_and_json(self):
        result = calculate_diagnostics(load_data(n=850)[1])
        json.dumps(result, allow_nan=False)
        self.assertEqual(result['return_count'], 849)
        self.assertEqual(result['arima']['order'], [1, 0, 0])
        self.assertEqual(result['ols_hac']['target'], 'r[t] = intercept + beta * r[t-1]')
        self.assertEqual(len(result['ols_hac']['coefficients']), 2)
        self.assertIn('not independence', result['normality']['interpretation'])

    def test_plot_and_bad_close(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = create_static_plot(load_data(n=850)[1], Path(tmp) / 'returns.png')
            self.assertEqual(Path(path).read_bytes()[:8], b'\x89PNG\r\n\x1a\n')
        with self.assertRaises(ValueError): calculate_diagnostics([1, 0, 2])


if __name__ == '__main__': unittest.main()
